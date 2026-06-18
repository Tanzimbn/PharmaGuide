"""M5 eval harness — retrieval accuracy + cosine score-guard calibration.

Off-device proxy for the mobile query path (mobile/app/src/{retrieve,answer}.ts).
Reuses the WEB app's real bge-small + chunk logic (backend/app/ingestion) — the
on-device int8 ONNX is parity-checked against this model (M0), so the cosine
distribution here is a faithful stand-in for the device, and far faster to sweep.

What it computes:
  1. Build the corpus: each PDF in eval/corpus/ -> extract -> chunk -> embed.
  2. For each gold question: embed -> brute-force cosine kNN (top-k = QUERY_TOP_K,
     == mobile retrieve.ts; cosine == dot on L2-normalized vectors).
  3. Retrieval accuracy over COVERED questions: recall@k + MRR (is an expected
     page of the expected doc in the top-k?).
  4. Score-guard calibration: sweep the threshold tau; a question is "answered"
     iff top-1 cosine >= tau. Score that decision against gold `covered` and
     report precision/recall/F1, then recommend tau (max F1, tie-break toward
     precision — refusing beats fabricating, NFR-1 / FR-Q7).

Run:
  cd mobile/tools/eval && ../../../backend/.venv/bin/python run_eval.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "backend"))

from app.ingestion.chunk import chunk_pages  # noqa: E402
from app.ingestion.embed import embed_query, embed_texts  # noqa: E402
from app.ingestion.extract import extract_pdf  # noqa: E402

HERE = Path(__file__).parent
CORPUS = HERE / "corpus"
GOLD = HERE / "gold.json"
REPORT = HERE / "report.json"

# Mirror mobile/app/src/config.ts QUERY_TOP_K (kNN top-k == final set, no rerank).
TOP_K = 5


class Chunk:
    __slots__ = ("doc", "page", "text", "vec")

    def __init__(self, doc: str, page: int, text: str, vec: np.ndarray):
        self.doc = doc
        self.page = page
        self.text = text
        self.vec = vec


def _unit(v: np.ndarray) -> np.ndarray:
    n = np.linalg.norm(v)
    return v / n if n else v


def build_corpus() -> list[Chunk]:
    pdfs = sorted(CORPUS.glob("*.pdf"))
    chunks: list[Chunk] = []
    for pdf in pdfs:
        pages = extract_pdf(pdf)
        cds = chunk_pages(pages)
        if not cds:
            print(f"  ! {pdf.name}: 0 chunks (empty/scanned PDF?)")
            continue
        vecs = embed_texts([c.text for c in cds])
        for c, v in zip(cds, vecs):
            chunks.append(Chunk(pdf.name, c.page_number, c.text, _unit(np.asarray(v, dtype=np.float64))))
        print(f"  {pdf.name}: {len(cds)} chunks")
    return chunks


def topk(chunks: list[Chunk], q: np.ndarray, k: int) -> list[tuple[float, Chunk]]:
    sims = [(float(c.vec @ q), c) for c in chunks]
    sims.sort(key=lambda t: -t[0])
    return sims[:k]


def main() -> int:
    if not CORPUS.exists() or not list(CORPUS.glob("*.pdf")):
        print(f"No PDFs in {CORPUS}/. Drop non-confidential sample PDFs there "
              f"(NFR-2), then author gold.json against them. See eval/README.md.")
        return 0
    if not GOLD.exists() or not json.loads(GOLD.read_text() or "[]"):
        print(f"{GOLD} is empty. Add gold questions (see eval/README.md), then re-run.")
        return 0

    gold = json.loads(GOLD.read_text())
    print("building corpus:")
    chunks = build_corpus()
    if not chunks:
        print("No chunks built — aborting.")
        return 1
    docs = sorted({c.doc for c in chunks})
    print(f"corpus: {len(chunks)} chunks across {len(docs)} docs\n")

    # --- per-question retrieval ---
    rows = []
    for g in gold:
        q = _unit(np.asarray(embed_query(g["question"]), dtype=np.float64))
        hits = topk(chunks, q, TOP_K)
        top1 = hits[0][0] if hits else 0.0

        rank = None  # 1-based rank of first expected (doc,page) hit
        if g.get("covered"):
            exp_doc = g["expected_doc"]
            exp_pages = set(g.get("expected_pages", []))
            for i, (_, c) in enumerate(hits):
                if c.doc == exp_doc and c.page in exp_pages:
                    rank = i + 1
                    break
        rows.append({
            "question": g["question"],
            "covered": bool(g.get("covered")),
            "top1": round(top1, 4),
            "rank": rank,
            "topk": [{"doc": c.doc, "page": c.page, "sim": round(s, 4)} for s, c in hits],
        })

    covered = [r for r in rows if r["covered"]]
    n_cov = len(covered)
    recall_at_k = sum(1 for r in covered if r["rank"]) / n_cov if n_cov else 0.0
    mrr = sum((1.0 / r["rank"]) for r in covered if r["rank"]) / n_cov if n_cov else 0.0

    # --- threshold sweep (covered-vs-not decision = top1 >= tau) ---
    sweep = []
    for tau in np.round(np.arange(0.0, 0.701, 0.01), 2):
        tp = sum(1 for r in rows if r["covered"] and r["top1"] >= tau)
        fp = sum(1 for r in rows if not r["covered"] and r["top1"] >= tau)
        fn = sum(1 for r in rows if r["covered"] and r["top1"] < tau)
        prec = tp / (tp + fp) if (tp + fp) else 1.0
        rec = tp / (tp + fn) if (tp + fn) else 1.0
        f1 = 2 * prec * rec / (prec + rec) if (prec + rec) else 0.0
        sweep.append({"tau": float(tau), "precision": round(prec, 3),
                      "recall": round(rec, 3), "f1": round(f1, 3)})
    # max F1, tie-break toward higher precision (safer to refuse).
    best = max(sweep, key=lambda s: (s["f1"], s["precision"]))

    # Robust τ: if covered/not-covered top-1 fully separate, sit in the MIDDLE of
    # the gap (max margin both ways) rather than at best-F1's lower edge — guards
    # against the small fp32→int8 cosine drift on-device. Else fall back to best.
    cov_top1 = [r["top1"] for r in covered]
    neg_top1 = [r["top1"] for r in rows if not r["covered"]]
    pos_min = min(cov_top1) if cov_top1 else 0.0
    neg_max = max(neg_top1) if neg_top1 else 0.0
    separable = bool(cov_top1) and bool(neg_top1) and pos_min > neg_max
    recommended = round((pos_min + neg_max) / 2, 3) if separable else best["tau"]

    # --- report ---
    print(f"retrieval (covered n={n_cov}):  recall@{TOP_K}={recall_at_k:.2f}  MRR={mrr:.2f}")
    print("\ncovered top-1 cosine:    ", sorted(cov_top1, reverse=True))
    print("not-covered top-1 cosine:", sorted(neg_top1, reverse=True))
    if separable:
        print(f"\nfully separable: gap ({neg_max:.4f}, {pos_min:.4f}] — margin ±{(pos_min - neg_max) / 2:.4f}")
    print(f"recommended SCORE_THRESHOLD = {recommended}  "
          f"(best-F1 τ={best['tau']} F1={best['f1']} P={best['precision']} R={best['recall']})")
    print("\ntau    prec  recall  f1")
    for s in sweep:
        mark = "  <-" if s["tau"] == best["tau"] else ""
        if 0.1 <= s["tau"] <= 0.6:
            print(f"{s['tau']:.2f}   {s['precision']:.2f}  {s['recall']:.2f}    {s['f1']:.2f}{mark}")

    REPORT.write_text(json.dumps({
        "top_k": TOP_K,
        "n_questions": len(rows),
        "n_covered": n_cov,
        "recall_at_k": round(recall_at_k, 4),
        "mrr": round(mrr, 4),
        "recommended_threshold": recommended,
        "separable": separable,
        "gap": {"neg_max": round(neg_max, 4), "pos_min": round(pos_min, 4)},
        "best": best,
        "sweep": sweep,
        "questions": rows,
    }, indent=2))
    print(f"\nwrote {REPORT.name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
