"""Ingestion orchestration (DB-backed)."""

import pytest
from sqlalchemy import func, select

from app.config import get_settings
from app.ingestion.guardrails import GuardrailError
from app.ingestion.pipeline import ingest_document
from app.models import Chunk, Document

_DIM = get_settings().embedding_dim


def _chunks(db, doc_id):
    return list(db.execute(select(Chunk).where(Chunk.doc_id == doc_id)).scalars())


def test_ingest_ready_with_chunks(db_session, sample_pdf):
    doc = ingest_document(
        db_session, file_path=sample_pdf, filename="g.pdf", category="Safety"
    )
    assert doc.status == "ready"
    assert doc.page_count == 2

    chunks = _chunks(db_session, doc.id)
    assert chunks, "expected chunks"
    assert all(len(c.embedding) == _DIM for c in chunks)
    assert all(c.page_number in (1, 2) for c in chunks)


def test_failure_marks_failed_no_partial_chunks(db_session, sample_pdf, monkeypatch):
    def boom(_path):
        raise RuntimeError("extract blew up")

    monkeypatch.setattr("app.ingestion.pipeline.extract_pdf", boom)

    with pytest.raises(RuntimeError):
        ingest_document(
            db_session, file_path=sample_pdf, filename="g.pdf", category="Safety"
        )

    doc = db_session.execute(select(Document)).scalar_one()
    assert doc.status == "failed"
    assert _chunks(db_session, doc.id) == []  # no partial chunks committed


def test_guardrail_oversized_creates_no_row(db_session, sample_pdf, monkeypatch):
    big = get_settings().max_pages_per_file + 1
    monkeypatch.setattr("app.ingestion.extract.page_count", lambda _p: big)

    with pytest.raises(GuardrailError):
        ingest_document(
            db_session, file_path=sample_pdf, filename="g.pdf", category="Safety"
        )

    count = db_session.execute(select(func.count()).select_from(Document)).scalar_one()
    assert count == 0  # rejected before any DB write
