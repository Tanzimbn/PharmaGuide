"""Atomic replace + delete (P1 task #9 — FR-A2, FR-A3, NFR-4).

delete_document: purge a document and all its chunks (DB ON DELETE CASCADE
+ ORM cascade) so no stale content remains.

replace_document: ingest the new version into a NEW doc_id while the old stays
live; only when the new version is fully extracted/embedded does a SINGLE
transaction delete the old document and flip the new one to `ready`. If
anything fails, the old version stays live and the half-built new row is
discarded. There is no window where both versions are queryable, and none
where neither is.
"""

from __future__ import annotations

import uuid
from pathlib import Path

from sqlalchemy.orm import Session

from app.ingestion.guardrails import validate_path
from app.ingestion.pipeline import _populate
from app.models import Document


def delete_document(db: Session, doc_id: uuid.UUID) -> bool:
    """Delete a document and its chunks. Returns False if not found."""
    doc = db.get(Document, doc_id)
    if doc is None:
        return False
    db.delete(doc)  # cascade purges chunks (NFR-4: no stale content)
    db.commit()
    return True


def replace_document(
    db: Session,
    old_doc_id: uuid.UUID,
    *,
    file_path: str | Path,
    filename: str,
    category: str,
) -> Document:
    """Atomically replace `old_doc_id` with a freshly ingested new version.

    Raises ValueError if the old document is missing, GuardrailError if the
    new file violates a hard limit (old stays live in both cases).
    """
    old = db.get(Document, old_doc_id)
    if old is None:
        raise ValueError(f"document {old_doc_id} not found")

    # Hard guardrails before any work — old version stays live on rejection.
    num_pages = validate_path(file_path)

    new = Document(
        filename=filename,
        category=category,
        status="processing",  # invisible to queries until promoted
        page_count=num_pages,
        version=old.version + 1,
    )
    db.add(new)
    db.commit()
    db.refresh(new)

    # Build new version's chunks (staged, not committed).
    try:
        _populate(db, new, file_path)
    except Exception:
        db.rollback()
        db.delete(new)  # discard half-built new version
        db.commit()
        raise  # old untouched and still live

    # Atomic promote: delete old + commit new chunks + flip new->ready, one txn.
    try:
        db.delete(old)
        new.status = "ready"
        db.commit()
    except Exception:
        db.rollback()
        db.delete(new)
        db.commit()
        raise

    db.refresh(new)
    return new
