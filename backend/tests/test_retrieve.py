"""Vector retrieval (DB-backed) — FR-Q4/Q8, NFR-4.

With faked embeddings every vector is identical, so these tests assert the
*filtering and shape* of retrieval (ready-only, doc scoping, citation
metadata), not semantic ranking — ranking quality is the reranker's job and is
covered separately.
"""

import uuid

from app.ingestion.pipeline import ingest_document
from app.models import Chunk, Document
from app.query.retrieve import retrieve


def test_retrieve_returns_chunks_with_citation_metadata(db_session, sample_pdf):
    ingest_document(
        db_session, file_path=sample_pdf, filename="g.pdf", category="Safety"
    )

    hits = retrieve(db_session, "maintenance interval", top_k=10)

    assert hits, "expected at least one hit"
    assert all(h.filename == "g.pdf" for h in hits)
    assert all(h.page_number in (1, 2) for h in hits)
    assert all(0.0 <= h.similarity <= 1.0 + 1e-6 for h in hits)
    assert all(h.rerank_score is None for h in hits)  # not reranked yet


def test_retrieve_scoped_to_selected_docs(db_session, sample_pdf):
    a = ingest_document(
        db_session, file_path=sample_pdf, filename="a.pdf", category="Safety"
    )
    ingest_document(
        db_session, file_path=sample_pdf, filename="b.pdf", category="Safety"
    )

    hits = retrieve(db_session, "ppe", doc_ids=[a.id], top_k=50)

    assert hits
    assert {h.doc_id for h in hits} == {a.id}  # FR-Q4: only selected doc


def test_retrieve_excludes_non_ready_docs(db_session):
    # A document still processing must never be retrievable (NFR-4).
    from app.config import get_settings

    d = get_settings().embedding_dim
    doc = Document(filename="wip.pdf", category="Safety", status="processing", page_count=1)
    db_session.add(doc)
    db_session.flush()
    db_session.add(
        Chunk(
            doc_id=doc.id,
            page_number=1,
            text="secret draft",
            embedding=[0.0] * (d - 1) + [1.0],
            token_count=2,
        )
    )
    db_session.flush()

    hits = retrieve(db_session, "draft", top_k=50)

    assert all(h.doc_id != doc.id for h in hits)
