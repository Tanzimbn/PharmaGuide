"""M0 spike — laptop step: export the web app's models to ONNX + parity check.

Produces the two ONNX files (and their tokenizers) the RN spike bundles, then
proves the ONNX outputs match the web app's actual Python encode path *before*
anything touches a phone. If parity fails here, it will fail on-device too —
stop and fix the export, don't build the app.

What it checks (mobile-m0-spike.md §3):
  * Embedding: BAAI/bge-small-en-v1.5 -> ONNX, 384-dim.
    POOLING IS **CLS**, NOT MEAN. The web app uses SentenceTransformer defaults,
    which for bge is CLS-token pooling + L2-normalize (backend/app/ingestion/embed.py).
    The spike doc's "mean-pool" note is wrong; matching it would break parity.
  * Reranker: BAAI/bge-reranker-base -> ONNX. Cross-encoder logit -> sigmoid,
    mirroring backend/app/query/rerank.py (_sigmoid on CrossEncoder.predict()).

Run:
    python export_onnx.py                 # exports to ../m0-spike/assets/models
    python export_onnx.py --out /tmp/x    # custom output dir

Exit code 0 = parity passed (sizes printed). Non-zero = parity failed.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np

EMBED_ID = "BAAI/bge-small-en-v1.5"
RERANK_ID = "BAAI/bge-reranker-base"
EMBED_DIM = 384  # must match backend/app/config.py:embedding_dim

# Sentences used both to verify parity and (later) for the on-device tokenizer
# id-match check (mobile-m0-spike.md §4).
PARITY_SENTENCES = [
    "Sterile products must be manufactured under controlled conditions.",
    "The acceptable daily exposure limit is 100 micrograms per day.",
    "What is the maximum holding time for bulk solution?",
]
PARITY_PAIRS = [
    ("maximum holding time for bulk solution",
     "Bulk solution may be held for no longer than 24 hours before filling."),
    ("cleaning validation acceptance criteria",
     "Sterile products must be manufactured under controlled conditions."),
]

COS_TOL = 1e-3   # fp32 embeddings: cosine to web vector must be >= 1 - COS_TOL
SCORE_TOL = 5e-3  # fp32 rerank: sigmoid score abs diff vs web

# int8 dynamic quantization adds error -> looser gates. These are *bundle
# precision* tolerances: if int8 fails them, ship fp32 (or drop the reranker).
COS_TOL_INT8 = 5e-3    # cosine >= 0.995 vs web (semantic ranking unaffected)
SCORE_TOL_INT8 = 3e-2  # rerank sigmoid within 0.03 of web


def _l2(v: np.ndarray) -> np.ndarray:
    return v / np.linalg.norm(v, axis=-1, keepdims=True)


def _sigmoid(x: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-x))


def export_embed(out: Path) -> Path:
    """Export bge-small to ONNX (feature-extraction -> last_hidden_state)."""
    from optimum.onnxruntime import ORTModelForFeatureExtraction
    from transformers import AutoTokenizer

    dst = out / "bge-small-en-v1.5"
    m = ORTModelForFeatureExtraction.from_pretrained(EMBED_ID, export=True)
    m.save_pretrained(dst)
    AutoTokenizer.from_pretrained(EMBED_ID).save_pretrained(dst)
    return dst


def export_rerank(out: Path) -> Path:
    """Export bge-reranker-base to ONNX (sequence-classification -> logit)."""
    from optimum.onnxruntime import ORTModelForSequenceClassification
    from transformers import AutoTokenizer

    dst = out / "bge-reranker-base"
    m = ORTModelForSequenceClassification.from_pretrained(RERANK_ID, export=True)
    m.save_pretrained(dst)
    AutoTokenizer.from_pretrained(RERANK_ID).save_pretrained(dst)
    return dst


def quantize(model_dir: Path) -> Path:
    """Dynamic int8 quantization of model.onnx -> model.int8.onnx (same dir).

    Dynamic (weight-only) quant is the right fit for transformers: weights go
    int8 (4x smaller), activations stay float and are quantized at runtime, so
    no calibration set is needed. per_channel keeps MatMul accuracy high enough
    that embedding cosine stays ~1.0 (verified by the int8 parity gate below).
    """
    from onnxruntime.quantization import QuantType, quantize_dynamic

    src = model_dir / "model.onnx"
    dst = model_dir / "model.int8.onnx"
    quantize_dynamic(
        str(src), str(dst), weight_type=QuantType.QInt8, per_channel=True
    )
    return dst


def onnx_embed(model_dir: Path, sentences: list[str],
               model_name: str = "model.onnx") -> np.ndarray:
    """ONNX embedding the way the phone will: CLS pool ([:,0,:]) then L2-norm."""
    import onnxruntime as ort
    from transformers import AutoTokenizer

    tok = AutoTokenizer.from_pretrained(model_dir)
    sess = ort.InferenceSession(str(model_dir / model_name))
    enc = tok(sentences, padding=True, truncation=True, return_tensors="np")
    feeds = {i.name: enc[i.name] for i in sess.get_inputs() if i.name in enc}
    last_hidden = sess.run(None, feeds)[0]      # (B, T, H)
    cls = last_hidden[:, 0, :]                   # CLS token  <-- not mean
    return _l2(cls.astype(np.float32))


def onnx_rerank(model_dir: Path, pairs: list[tuple[str, str]],
                model_name: str = "model.onnx") -> np.ndarray:
    import onnxruntime as ort
    from transformers import AutoTokenizer

    # Load from the hub id (not the saved dir) so tokenization matches the web
    # side exactly and avoids a saved-tokenizer regex warning.
    tok = AutoTokenizer.from_pretrained(RERANK_ID)
    sess = ort.InferenceSession(str(model_dir / model_name))
    q = [p[0] for p in pairs]
    d = [p[1] for p in pairs]
    enc = tok(q, d, padding=True, truncation=True, return_tensors="np")
    feeds = {i.name: enc[i.name] for i in sess.get_inputs() if i.name in enc}
    logits = sess.run(None, feeds)[0].reshape(-1)  # (B,)
    return _sigmoid(logits.astype(np.float32))


def web_embed(sentences: list[str]) -> np.ndarray:
    from sentence_transformers import SentenceTransformer

    v = SentenceTransformer(EMBED_ID).encode(sentences, normalize_embeddings=True)
    return np.asarray(v, dtype=np.float32)


def web_rerank(pairs: list[tuple[str, str]]) -> np.ndarray:
    """True model score: raw logit -> sigmoid (what the ONNX path computes).

    NOTE: this is NOT what the deployed web app stores. CrossEncoder.predict()
    already applies its default Sigmoid (num_labels=1), and
    backend/app/query/rerank.py applies sigmoid AGAIN -> the web rerank_score is
    sigmoid(sigmoid(logit)), squashed to ~[0.5, 0.73]. Monotonic (ranking is
    unaffected) but score_threshold lives in that squashed range. We compare the
    *true* scores here to validate EXPORT fidelity; threshold transfer is an M2
    concern. (See findings note printed at the end.)
    """
    import torch
    from sentence_transformers import CrossEncoder

    ce = CrossEncoder(RERANK_ID)
    mdl = ce.model.to("cpu").eval()
    enc = ce.tokenizer(
        [p[0] for p in pairs],
        [p[1] for p in pairs],
        padding=True,
        truncation=True,
        return_tensors="pt",
    )
    with torch.no_grad():
        logits = mdl(**enc).logits.reshape(-1).cpu().numpy()
    return _sigmoid(logits.astype(np.float32))


def dump_tokenizer_parity(out_root: Path) -> Path:
    """Write the Python embedding-tokenizer ids the on-device WordPiece check
    asserts against (mobile-m0-spike.md §4). Bundled + read by the RN app."""
    from transformers import AutoTokenizer

    tok = AutoTokenizer.from_pretrained(EMBED_ID)
    expected = {
        s: tok(s, add_special_tokens=True)["input_ids"] for s in PARITY_SENTENCES
    }
    dst = out_root / "tokenizer_parity.json"
    dst.write_text(json.dumps(expected, indent=2))
    return dst


def _mb(p: Path) -> float:
    return p.stat().st_size / (1024 * 1024)


def run_parity(embed_dir: Path, rerank_dir: Path, web_e: np.ndarray,
               web_r: np.ndarray, model_name: str, cos_tol: float,
               score_tol: float, label: str) -> bool:
    """Compare one ONNX precision (model_name) against the cached web outputs."""
    ok = True
    o = onnx_embed(embed_dir, PARITY_SENTENCES, model_name)
    if o.shape[1] != EMBED_DIM:
        print(f"FAIL embed dim: got {o.shape[1]}, want {EMBED_DIM}")
        ok = False
    cos = np.sum(_l2(web_e) * o, axis=1)  # both normalized -> dot = cosine
    print(f"\n[{label}] embedding parity (cosine, want >= {1 - cos_tol:.4f}):")
    for s, c in zip(PARITY_SENTENCES, cos):
        flag = "ok" if c >= 1 - cos_tol else "FAIL"
        print(f"  [{flag}] {c:.5f}  {s[:48]}")
    ok = ok and bool(np.all(cos >= 1 - cos_tol))

    orr = onnx_rerank(rerank_dir, PARITY_PAIRS, model_name)
    print(f"[{label}] rerank parity (sigmoid, want |diff| <= {score_tol:.3f}):")
    for (q, _), a, b in zip(PARITY_PAIRS, web_r, orr):
        diff = abs(float(a) - float(b))
        flag = "ok" if diff <= score_tol else "FAIL"
        print(f"  [{flag}] web={a:.4f} onnx={b:.4f} d={diff:.4f}  {q[:40]}")
    ok = ok and bool(np.all(np.abs(web_r - orr) <= score_tol))
    return ok


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--out",
        default=str(Path(__file__).resolve().parent.parent / "m0-spike" / "assets" / "models"),
        help="output dir for ONNX models + tokenizers",
    )
    args = ap.parse_args()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    print(f"Exporting to {out}\n")
    embed_dir = export_embed(out)
    rerank_dir = export_rerank(out)
    parity_file = dump_tokenizer_parity(out.parent)
    print(f"Wrote tokenizer parity ids -> {parity_file}\n")

    print("Quantizing fp32 -> int8 (dynamic, per-channel)...")
    quantize(embed_dir)
    quantize(rerank_dir)

    print("\nModel sizes (bundle-vs-download input):")
    for name, d in (("embed", embed_dir), ("rerank", rerank_dir)):
        f32 = _mb(d / "model.onnx")
        i8 = _mb(d / "model.int8.onnx")
        print(f"  {name:6s}: fp32 {f32:7.1f} MB -> int8 {i8:7.1f} MB"
              f"  ({f32 / i8:.1f}x smaller)")

    # Web outputs (the web app's actual encode path) — computed once, reused.
    w = web_embed(PARITY_SENTENCES)
    wr = web_rerank(PARITY_PAIRS)

    fp32_ok = run_parity(embed_dir, rerank_dir, w, wr, "model.onnx",
                         COS_TOL, SCORE_TOL, "fp32")
    int8_ok = run_parity(embed_dir, rerank_dir, w, wr, "model.int8.onnx",
                         COS_TOL_INT8, SCORE_TOL_INT8, "int8")

    # fp32 fidelity is the export gate (must pass). int8 is the bundle target:
    # if it passes, the app ships int8; if not, fall back to fp32 (or drop the
    # reranker per mobile.md §12) — fp32 passing still lets the spike proceed.
    print()
    if not fp32_ok:
        print("PARITY FAILED — fp32 export is wrong, fix before building.")
        return 1
    if int8_ok:
        print("PARITY PASSED — bundle int8 (set BUNDLE in src/assets.ts).")
    else:
        print("PARITY PASSED (fp32) — int8 drifted past tolerance; bundle fp32.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
