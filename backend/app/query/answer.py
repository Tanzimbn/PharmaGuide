"""Answer orchestration (P2) — the end-to-end query pipeline (arch §6).

embed query -> pgvector search (ready + selected docs) -> cross-encoder rerank
-> score guard -> grounded generation with mandatory page citations.

Groundedness is enforced twice (NFR-1): a retrieval-score guard returns
"not covered" before any LLM call when nothing clears `score_threshold`
(FR-Q7), and the grounded system prompt forbids outside knowledge (FR-R3).
"""

from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.config import get_settings
from app.query.llm import LLMProvider, SYSTEM_PROMPT, build_user_prompt, get_provider
from app.query.rerank import rerank
from app.query.retrieve import RetrievedChunk, retrieve
from app.schemas import AnswerOut, Citation

_settings = get_settings()

NOT_COVERED = "Not covered in the selected guidelines."


def _citations(chunks: list[RetrievedChunk]) -> list[Citation]:
    """Dedupe to one citation per (doc, page), preserving rerank order."""
    seen: set[tuple[uuid.UUID, int]] = set()
    out: list[Citation] = []
    for c in chunks:
        key = (c.doc_id, c.page_number)
        if key in seen:
            continue
        seen.add(key)
        out.append(Citation(doc_id=c.doc_id, filename=c.filename, page=c.page_number))
    return out


def answer_question(
    db: Session,
    question: str,
    *,
    doc_ids: list[uuid.UUID] | None = None,
    provider: LLMProvider | None = None,
) -> AnswerOut:
    candidates = retrieve(db, question, doc_ids=doc_ids)
    top = rerank(question, candidates)

    # Score guard: nothing relevant enough -> refuse rather than fabricate.
    if not top or (top[0].rerank_score or 0.0) < _settings.score_threshold:
        return AnswerOut(answer=NOT_COVERED, citations=[], not_covered=True)

    provider = provider or get_provider()
    text = provider.generate(
        system=SYSTEM_PROMPT, user=build_user_prompt(question, top)
    )
    return AnswerOut(answer=text, citations=_citations(top), not_covered=False)
