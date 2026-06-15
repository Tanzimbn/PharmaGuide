"""Vector retrieval (P2) — pgvector cosine search over chunks.

Embeds the query with the same local model used at ingest, then runs a
cosine-distance nearest-neighbour search (HNSW `vector_cosine_ops`, migration
0001). Results are constrained to the caller's selected documents and to
documents that are currently `ready` — so retired/processing/failed versions
are never retrievable (FR-Q4 / FR-Q8, NFR-4).
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.ingestion.embed import embed_query
from app.models import Chunk, Document

_settings = get_settings()


@dataclass
class RetrievedChunk:
    """A retrieved passage with its scores and citation metadata."""

    chunk_id: uuid.UUID
    doc_id: uuid.UUID
    filename: str
    page_number: int
    text: str
    similarity: float  # cosine similarity (1 - distance), 0..1 for normalized vecs
    rerank_score: float | None = None  # filled in by the reranker (P2 task #14)


def retrieve(
    db: Session,
    question: str,
    *,
    doc_ids: list[uuid.UUID] | None = None,
    top_k: int | None = None,
) -> list[RetrievedChunk]:
    """Top-k chunks for `question`, restricted to ready docs (and `doc_ids`).

    `doc_ids=None` (or empty) means "all ready documents" (default scope).
    Returns at most `top_k` chunks ordered by descending similarity.
    """
    top_k = top_k or _settings.retrieve_top_k
    qvec = embed_query(question)
    distance = Chunk.embedding.cosine_distance(qvec)

    stmt = (
        select(
            Chunk.id,
            Chunk.doc_id,
            Document.filename,
            Chunk.page_number,
            Chunk.text,
            distance.label("distance"),
        )
        .join(Document, Chunk.doc_id == Document.id)
        .where(Document.status == "ready")
    )
    if doc_ids:
        stmt = stmt.where(Chunk.doc_id.in_(doc_ids))
    stmt = stmt.order_by(distance).limit(top_k)

    rows = db.execute(stmt).all()
    return [
        RetrievedChunk(
            chunk_id=r.id,
            doc_id=r.doc_id,
            filename=r.filename,
            page_number=r.page_number,
            text=r.text,
            similarity=1.0 - float(r.distance),
        )
        for r in rows
    ]
