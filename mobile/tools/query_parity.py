"""Query-parity fixture generator (M2 verification).

Two checks, both written here for the TS side (query_parity.ts) to assert:

1. PROMPT/CITATION PARITY — the grounded contract must be byte-identical between
   web (backend/app/query) and mobile (mobile/app/src). Runs the WEB
   SYSTEM_PROMPT + build_context + build_user_prompt + citation dedup on a fixed
   chunk fixture and dumps the outputs.

2. kNN PARITY — confirms the mobile brute-force cosine ranking matches numpy.
   Generates seeded unit vectors + a query, ranks by cosine (== dot on
   normalized vectors), and dumps vectors + the expected order/scores.

Usage:
  ../../backend/.venv/bin/python query_parity.py
"""

from __future__ import annotations

import json
import sys
import uuid
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from app.query.answer import _citations  # noqa: E402
from app.query.llm import (  # noqa: E402
    SYSTEM_PROMPT,
    build_context,
    build_user_prompt,
)
from app.query.retrieve import RetrievedChunk  # noqa: E402

OUT = Path(__file__).parent

# Fixed doc ids so the dedup-by-(doc_id, page) behaviour is exercised across
# documents and repeated pages.
DOC_A = uuid.UUID("11111111-1111-1111-1111-111111111111")
DOC_B = uuid.UUID("22222222-2222-2222-2222-222222222222")

QUESTION = "What is the acceptance limit for total impurities?"

# Note repeats: (A,p2) twice -> one citation; tables/newlines/units in text.
CHUNKS = [
    RetrievedChunk(uuid.uuid4(), DOC_A, "ICH-Q3A.pdf", 2,
                   "Total impurities must not exceed 0.5%.\n| Imp | Limit |\n| --- | --- |\n| Total | 0.5% |", 0.81),
    RetrievedChunk(uuid.uuid4(), DOC_A, "ICH-Q3A.pdf", 2,
                   "Reporting threshold is 0.05%.", 0.74),
    RetrievedChunk(uuid.uuid4(), DOC_B, "GMP-Annex1.pdf", 17,
                   "Cleanroom grade A: <1 particle/m3 at 5 µm.", 0.66),
]


def _prompt_fixtures() -> None:
    chunk_dump = [
        {
            "chunk_id": str(c.chunk_id),
            "doc_id": str(c.doc_id),
            "filename": c.filename,
            "page_number": c.page_number,
            "text": c.text,
            "similarity": c.similarity,
        }
        for c in CHUNKS
    ]
    cites = [{"doc_id": str(c.doc_id), "filename": c.filename, "page": c.page} for c in _citations(CHUNKS)]
    payload = {
        "question": QUESTION,
        "chunks": chunk_dump,
        "system_prompt": SYSTEM_PROMPT,
        "context": build_context(CHUNKS),
        "user_prompt": build_user_prompt(QUESTION, CHUNKS),
        "citations": cites,
    }
    (OUT / "query_prompt.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2))
    print(f"  prompt: {len(chunk_dump)} chunks, {len(cites)} citations")


def _knn_fixtures() -> None:
    rng = np.random.default_rng(42)
    dim, n = 384, 50
    mat = rng.standard_normal((n, dim))
    mat /= np.linalg.norm(mat, axis=1, keepdims=True)  # L2-normalize like ingest
    q = rng.standard_normal(dim)
    q /= np.linalg.norm(q)

    sims = mat @ q  # cosine == dot on normalized vectors
    order = np.argsort(-sims).tolist()  # indices, descending similarity
    payload = {
        "query": q.tolist(),
        "vectors": mat.tolist(),
        "order": order,
        "scores": [float(sims[i]) for i in order],
    }
    (OUT / "query_knn.json").write_text(json.dumps(payload))
    print(f"  knn: {n} vectors dim {dim}")


def main() -> int:
    print("wrote query parity fixtures:")
    _prompt_fixtures()
    _knn_fixtures()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
