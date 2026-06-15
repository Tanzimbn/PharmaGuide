"""Ingestion orchestration (P1 task #8).

Single-document pipeline:

    guardrails -> documents row (processing) -> extract -> chunk -> embed
    -> bulk insert chunks + status=ready   (one transaction)

On any failure the chunk transaction is rolled back (no partial chunks land)
and the document is marked `failed`. `_populate` is the shared extract→chunk→
embed step reused by atomic replace (task #9).
"""

from __future__ import annotations

from pathlib import Path

from sqlalchemy.orm import Session

from app.ingestion.chunk import chunk_pages
from app.ingestion.embed import embed_texts
from app.ingestion.extract import extract_pdf
from app.ingestion.guardrails import validate_path
from app.models import Chunk, Document


def _populate(db: Session, doc: Document, file_path: str | Path) -> None:
    """Extract→chunk→embed and stage chunk rows for `doc` (no commit here).

    Chunks are added to the session but NOT committed, so the caller controls
    the transaction boundary (plain ingest vs. atomic promote in replace).
    """
    pages = extract_pdf(file_path)
    chunks = chunk_pages(pages)
    if not chunks:
        return
    vectors = embed_texts([c.text for c in chunks])
    db.add_all(
        [
            Chunk(
                doc_id=doc.id,
                page_number=c.page_number,
                text=c.text,
                embedding=v,
                token_count=c.token_count,
            )
            for c, v in zip(chunks, vectors, strict=True)
        ]
    )


def ingest_document(
    db: Session,
    *,
    file_path: str | Path,
    filename: str,
    category: str,
    version: int = 1,
) -> Document:
    """Ingest one PDF into a new document + its chunks.

    Raises GuardrailError (before any DB write) if the file violates a hard
    limit. On pipeline failure, marks the document `failed` and re-raises.
    """
    num_pages = validate_path(file_path)

    doc = Document(
        filename=filename,
        category=category,
        status="processing",
        page_count=num_pages,
        version=version,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    try:
        _populate(db, doc, file_path)
        doc.status = "ready"
        db.commit()  # chunks + status flip commit together
    except Exception:
        db.rollback()  # discards any uncommitted chunks
        doc.status = "failed"
        db.commit()
        raise

    db.refresh(doc)
    return doc
