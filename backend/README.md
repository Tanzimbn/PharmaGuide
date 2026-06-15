# PharmaGuide — Backend

RAG compliance chatbot backend (FastAPI). See [`../docs/architecture.md`](../docs/architecture.md).

## Layout

```
app/
  config.py      env-driven settings (DB, embedding model, guardrails)
  main.py        FastAPI entrypoint + /health
  db/            DB session + engine            (task #2)
  models/        SQLAlchemy ORM models          (task #3)
  ingestion/     extract → chunk → embed → store (tasks #4–#10)
tests/           pytest suite                   (task #11)
```

## Setup

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env        # adjust DATABASE_URL etc.
uvicorn app.main:app --reload
```

`GET /health` → `{"status": "ok"}`.
