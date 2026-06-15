"""Answer pipeline + query API (DB-backed) — FR-Q6/Q7, FR-R3, NFR-1.

Reranking and LLM generation are faked: the cross-encoder and hosted endpoint
are out of scope for unit tests. We assert the orchestration contract — score
guard, no-LLM-call on "not covered", citation shaping, and HTTP wiring.
"""

from app.ingestion.pipeline import ingest_document
from app.query import answer as answer_mod
from app.query.retrieve import RetrievedChunk
from app.schemas import AnswerOut


class _FakeProvider:
    """Records whether it was called; returns canned grounded text."""

    def __init__(self, text="Pump X interval is 30 days (g.pdf, p.1)."):
        self.text = text
        self.called = False

    def generate(self, *, system: str, user: str) -> str:
        self.called = True
        assert "Context passages" in user  # grounded prompt was built
        return self.text


class _ExplodingProvider:
    def generate(self, *, system: str, user: str) -> str:
        raise AssertionError("LLM must not be called when below threshold")


def _fake_rerank(score: float):
    """A rerank stand-in that stamps every candidate with a fixed score."""

    def _rr(question, candidates, *, top_n=None):
        for c in candidates:
            c.rerank_score = score
        return candidates[: (top_n or len(candidates))]

    return _rr


def test_answer_generates_with_citations(db_session, sample_pdf, monkeypatch):
    ingest_document(
        db_session, file_path=sample_pdf, filename="g.pdf", category="Safety"
    )
    monkeypatch.setattr(answer_mod, "rerank", _fake_rerank(0.9))
    provider = _FakeProvider()

    out = answer_question_helper(db_session, "interval for pump X?", provider)

    assert provider.called
    assert out.not_covered is False
    assert out.answer == provider.text
    assert out.citations and all(c.filename == "g.pdf" for c in out.citations)


def test_answer_not_covered_below_threshold_skips_llm(
    db_session, sample_pdf, monkeypatch
):
    ingest_document(
        db_session, file_path=sample_pdf, filename="g.pdf", category="Safety"
    )
    monkeypatch.setattr(answer_mod, "rerank", _fake_rerank(0.01))  # below threshold

    out = answer_question_helper(db_session, "irrelevant question", _ExplodingProvider())

    assert out.not_covered is True
    assert out.citations == []
    assert out.answer == answer_mod.NOT_COVERED


def test_answer_not_covered_on_empty_corpus(db_session):
    out = answer_mod.answer_question(
        db_session, "anything", provider=_ExplodingProvider()
    )
    assert out.not_covered is True


def test_citations_deduped_by_doc_and_page():
    import uuid

    doc_id = uuid.uuid4()
    chunks = [
        RetrievedChunk(uuid.uuid4(), doc_id, "g.pdf", 1, "a", 0.9, 0.9),
        RetrievedChunk(uuid.uuid4(), doc_id, "g.pdf", 1, "b", 0.8, 0.8),  # same page
        RetrievedChunk(uuid.uuid4(), doc_id, "g.pdf", 2, "c", 0.7, 0.7),
    ]
    cites = answer_mod._citations(chunks)
    assert [(c.page) for c in cites] == [1, 2]


# --- API ---


def test_query_api_returns_answer(client, db_session, sample_pdf, monkeypatch):
    with open(sample_pdf, "rb") as f:
        client.post(
            "/documents",
            files={"file": ("g.pdf", f, "application/pdf")},
            data={"category": "Safety"},
        )
    monkeypatch.setattr(answer_mod, "rerank", _fake_rerank(0.9))
    monkeypatch.setattr(answer_mod, "get_provider", lambda: _FakeProvider())

    r = client.post("/query", json={"question": "interval for pump X?"})

    assert r.status_code == 200
    body = r.json()
    assert body["not_covered"] is False
    assert body["citations"]


def test_query_api_empty_question_400(client):
    r = client.post("/query", json={"question": "   "})
    assert r.status_code == 400


def test_query_api_unknown_doc_ids_400(client, db_session):
    import uuid

    r = client.post(
        "/query",
        json={"question": "anything", "doc_ids": [str(uuid.uuid4())]},
    )
    assert r.status_code == 400


# --------------------------------------------------------------------------- #
# helper: exercise the orchestrator with an injected provider
# --------------------------------------------------------------------------- #
def answer_question_helper(db, question, provider) -> AnswerOut:
    return answer_mod.answer_question(db, question, provider=provider)
