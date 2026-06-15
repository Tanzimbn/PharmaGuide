"""Atomic replace + delete (DB-backed) — FR-A2/A3, NFR-4."""

import pytest
from sqlalchemy import func, select

from app.ingestion.lifecycle import delete_document, replace_document
from app.ingestion.pipeline import ingest_document
from app.models import Chunk, Document


def _count(db, model):
    return db.execute(select(func.count()).select_from(model)).scalar_one()


def test_delete_purges_doc_and_chunks(db_session, sample_pdf):
    doc = ingest_document(
        db_session, file_path=sample_pdf, filename="g.pdf", category="Safety"
    )
    doc_id = doc.id
    assert _count(db_session, Chunk) > 0

    assert delete_document(db_session, doc_id) is True
    assert db_session.get(Document, doc_id) is None
    assert _count(db_session, Chunk) == 0


def test_delete_missing_returns_false(db_session):
    import uuid

    assert delete_document(db_session, uuid.uuid4()) is False


def test_replace_is_atomic(db_session, sample_pdf):
    old = ingest_document(
        db_session, file_path=sample_pdf, filename="v1.pdf", category="Safety"
    )
    old_id = old.id

    new = replace_document(
        db_session, old_id, file_path=sample_pdf, filename="v2.pdf", category="Safety"
    )

    assert db_session.get(Document, old_id) is None  # old purged
    assert new.status == "ready"
    assert new.version == 2
    assert new.filename == "v2.pdf"
    assert _count(db_session, Document) == 1  # only newest live
    # all chunks belong to the new doc
    assert all(
        c.doc_id == new.id
        for c in db_session.execute(select(Chunk)).scalars()
    )


def test_replace_failure_keeps_old_live(db_session, sample_pdf, monkeypatch):
    old = ingest_document(
        db_session, file_path=sample_pdf, filename="v1.pdf", category="Safety"
    )
    old_id = old.id

    monkeypatch.setattr(
        "app.ingestion.pipeline.extract_pdf",
        lambda _p: (_ for _ in ()).throw(RuntimeError("boom")),
    )

    with pytest.raises(RuntimeError):
        replace_document(
            db_session, old_id, file_path=sample_pdf, filename="v2.pdf", category="Safety"
        )

    surviving = db_session.get(Document, old_id)
    assert surviving is not None and surviving.status == "ready"  # old still live
    assert _count(db_session, Document) == 1  # half-built new discarded
