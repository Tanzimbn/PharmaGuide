"""Shared test fixtures.

Pure-Python tests (extract/chunk/guardrails) run anywhere. DB tests are
skipped automatically when Postgres+pgvector is not reachable. Embeddings are
faked so no model download is needed.
"""

from __future__ import annotations

import os
import tempfile
from collections.abc import Iterator

import pytest

from app.config import get_settings

_DIM = get_settings().embedding_dim


# --------------------------------------------------------------------------- #
# Sample PDF
# --------------------------------------------------------------------------- #
@pytest.fixture
def sample_pdf() -> Iterator[str]:
    """A 2-page PDF: text + a ruled table on page 1, text on page 2."""
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.platypus import (
        PageBreak,
        Paragraph,
        SimpleDocTemplate,
        Spacer,
        Table,
        TableStyle,
    )

    fd, path = tempfile.mkstemp(suffix=".pdf")
    os.close(fd)
    styles = getSampleStyleSheet()
    doc = SimpleDocTemplate(path, pagesize=letter)
    doc.build(
        [
            Paragraph("Maintenance interval for pump X is 30 days.", styles["Normal"]),
            Spacer(1, 12),
            Table(
                [["Parameter", "Value"], ["Torque", "50 Nm"], ["Interval", "30 days"]],
                style=TableStyle([("GRID", (0, 0), (-1, -1), 1, colors.black)]),
            ),
            PageBreak(),
            Paragraph("PPE required: gloves and goggles.", styles["Normal"]),
        ]
    )
    yield path
    os.unlink(path)


# --------------------------------------------------------------------------- #
# Fake embeddings (no model download)
# --------------------------------------------------------------------------- #
@pytest.fixture(autouse=True)
def fake_embeddings(monkeypatch) -> None:
    def _fake(texts: list[str], batch_size: int = 32) -> list[list[float]]:
        return [[0.0] * (_DIM - 1) + [1.0] for _ in texts]

    # Patch in every namespace that imported it.
    monkeypatch.setattr("app.ingestion.pipeline.embed_texts", _fake)
    monkeypatch.setattr("app.ingestion.embed.embed_texts", _fake, raising=False)


# --------------------------------------------------------------------------- #
# DB session (skips if Postgres/pgvector unavailable)
# --------------------------------------------------------------------------- #
@pytest.fixture
def db_session() -> Iterator[object]:
    from sqlalchemy.orm import Session

    from app.db.base import Base
    from app.db.session import check_db, engine
    import app.models  # noqa: F401  registers tables

    if not check_db():
        pytest.skip("Postgres+pgvector not reachable")

    Base.metadata.create_all(engine)
    conn = engine.connect()
    trans = conn.begin()
    # session.commit() inside the pipeline stays within a savepoint, so the
    # outer rollback fully isolates each test.
    session = Session(bind=conn, join_transaction_mode="create_savepoint")
    try:
        yield session
    finally:
        session.close()
        trans.rollback()
        conn.close()


@pytest.fixture
def client(db_session) -> Iterator[object]:
    from fastapi.testclient import TestClient

    from app.db.session import get_db
    from app.main import app

    app.dependency_overrides[get_db] = lambda: db_session
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()
