"""Local cross-encoder reranker (P2, FR-R2).

Vector search optimizes recall; a cross-encoder re-scores each (query, chunk)
pair jointly for precision before the top-n reaches the LLM. Runs locally
(free + private). The model is loaded lazily once, so importing this module —
and tests that fake reranking — stay cheap and torch-free.

Raw cross-encoder outputs are logits; we squash them through a sigmoid to a
0..1 relevance score so `score_threshold` (config) has a stable meaning.
"""

from __future__ import annotations

import math
from functools import lru_cache

from app.config import get_settings
from app.query.retrieve import RetrievedChunk

_settings = get_settings()


@lru_cache(maxsize=1)
def _model():
    # Lazy import keeps module import cheap and avoids loading torch in tests.
    from sentence_transformers import CrossEncoder

    return CrossEncoder(_settings.rerank_model)


def _sigmoid(x: float) -> float:
    return 1.0 / (1.0 + math.exp(-x))


def rerank(
    question: str,
    candidates: list[RetrievedChunk],
    *,
    top_n: int | None = None,
) -> list[RetrievedChunk]:
    """Re-score candidates against the query and return the best `top_n`.

    Sets `rerank_score` (0..1) on each returned chunk and sorts by it
    descending. Empty input returns empty (no model load).
    """
    if not candidates:
        return []
    top_n = top_n or _settings.rerank_top_n

    pairs = [(question, c.text) for c in candidates]
    logits = _model().predict(pairs)

    for c, logit in zip(candidates, logits, strict=True):
        c.rerank_score = _sigmoid(float(logit))

    ranked = sorted(candidates, key=lambda c: c.rerank_score or 0.0, reverse=True)
    return ranked[:top_n]
