# PharmaGuide

RAG compliance chatbot: answers pharma-manufacturing guideline questions
**only** from company-uploaded PDFs, with mandatory page citations and a
"not covered in the selected guidelines" fallback. Admins manage PDFs;
engineers query a document-scoped corpus. Specs live in `docs/mvp.md` and
`docs/architecture.md` — treat those as the source of truth for requirements
(FR-*/NFR-* IDs are referenced throughout the code).

**Two product tracks.** *Track A — web* (this codebase: shared admin-curated
corpus, server-side models, phases P1–P5) is what currently exists. *Track B —
mobile* (a personal, on-device React Native app with the same groundedness
contract; specced in `docs/mobile.md`, phases M0–M5) is planned and not yet
built. The web app stays and evolves on its own; mobile is a separate build.
Unless a task says "mobile", assume Track A.

## Non-negotiables (groundedness first — NFR-1)

- Answers come **only** from retrieved chunks. Never supplement with model
  knowledge (FR-R3). Generation is temperature 0 (FR-R4).
- Every grounded answer carries **page-level** citations (OQ-2). `page_number`
  flows extract → chunk → DB → citation. No section parsing.
- Double "not covered" guard: a retrieval **score threshold** refuses before any
  LLM call (FR-Q7), and the grounded prompt forbids outside knowledge.
- Only `ready` documents are queryable. Replace is **atomic** — old version is
  never live alongside the new, and no stale content survives (FR-A3, NFR-4).
- Retrieval is constrained to the user's selected `doc_ids` (FR-Q4/Q8).
- **Data residency (NFR-2):** the MVP uses a hosted free-trial LLM behind a
  swappable adapter. Use **non-confidential sample PDFs only** until generation
  moves in-VPC / on-device.

## Workflow conventions

- **The user makes all git commits.** Never run `git commit`. When asked, provide
  the commit message text only. End messages with the
  `Co-Authored-By: Claude Opus 4.8` trailer.
- No authentication in the MVP (OQ-4); add before multi-user production.
- Work proceeds in phases (see `docs/mvp.md` §9). Decompose a phase into
  ordered tasks, implement, then hand the user a commit message.

## Layout

```
backend/            FastAPI + SQLAlchemy 2.0 + Alembic; Postgres/pgvector
  app/
    config.py       pydantic-settings, env-driven, lru_cached get_settings()
    db/             Base, engine/session, check_db()
    models/         Document, Chunk (pgvector Vector column)
    ingestion/      extract, chunk, embed, guardrails, pipeline, lifecycle (P1)
    query/          retrieve, rerank, llm (adapter), answer (orchestrator) (P2)
    api/            documents (admin CRUD), query (POST /query)
    schemas.py      pydantic I/O models
  migrations/       Alembic; 0001 = tables + HNSW + btree indexes
  tests/            pytest; DB tests skip when Postgres absent
frontend/           Vite + React 19 + TS + Tailwind v4 query UI (P3)
docs/               mvp.md (requirements), architecture.md (design)
```

## Run

Backend (needs full deps incl. torch):
```bash
cd backend
docker compose up -d                 # Postgres + pgvector on :5432
python -m venv .venv && source .venv/bin/activate
pip install -e .
alembic upgrade head
export LLM_API_KEY=...                # OpenAI-compatible; required for generation
uvicorn app.main:app --reload         # :8000
```

Frontend:
```bash
cd frontend && npm install && npm run dev   # :5173, proxies /api -> :8000
```

## Tests

```bash
cd backend && pytest -q
```

- Pure tests (extract/chunk/guardrails) run anywhere. DB-backed tests **skip**
  automatically when Postgres+pgvector is unreachable.
- `tests/conftest.py` fakes embeddings (autouse) so no model downloads; fake the
  reranker and LLM provider per-test (see `tests/test_query.py`). Inject a fake
  `LLMProvider` via `answer_question(..., provider=...)` or by patching
  `app.query.answer.get_provider`.
- Test isolation uses an outer transaction + `join_transaction_mode=
  "create_savepoint"`, so the pipeline's internal commits roll back per test.

## Key technical choices

- **Embeddings/rerank run locally** (free + private; only top reranked chunks
  reach the hosted LLM). Lazy singleton load — modules import without torch.
- Embeddings: `BAAI/bge-small-en-v1.5` (384-dim, L2-normalized for cosine HNSW).
  Reranker: `BAAI/bge-reranker-base` (cross-encoder, sigmoid-scored).
- **LLM adapter is the single swap point** (`app/query/llm.py`): OpenAI-compatible
  `/chat/completions`. Swap host/model via `LLM_BASE_URL`/`LLM_MODEL`/`LLM_API_KEY`
  env — config-only change to go on-device (Ollama, etc.).
- pdfplumber extraction keeps **tables structural** (rendered to markdown, not
  flattened) so numeric/tabular answers stay correct (FR-R1).
- Upload guardrails: hard-reject > 150 pages or > 50 MB; soft (non-blocking)
  corpus-size alert.

## Phase status

**Track A (web):**
- **P1 Ingestion core** — done (extract, chunk, embed, store, atomic replace/delete).
- **P2 Query core** — done (retrieve → rerank → score guard → cited generation).
- **P3 Document selection** — done (React query UI, scoped queries).
- **P4 Admin UI** — done (React upload/categorize/replace/delete with live status;
  branch `feat/p4-admin-ui`).
- **P5 eval/gold-set + latency tune** — not started. `score_threshold` (config)
  is a placeholder to tune against a gold set in P5.

**Track B (mobile, `docs/mobile.md`):** not started. Phases M0–M5; M0 is an
on-device ONNX inference spike that de-risks the whole track. No code yet.
