# PharmaGuide — Query UI (P3)

React + Vite + TypeScript + Tailwind v4 frontend for the engineer query
experience: pick which guideline PDFs are in scope, ask a question, read a
grounded answer with page citations.

## Run (dev)

The backend must be running first (it serves `/documents` and `/query`):

```bash
# 1. Backend (from repo root)
cd backend
docker compose up -d                 # Postgres + pgvector
uvicorn app.main:app --reload        # serves http://localhost:8000
# set LLM_API_KEY (and LLM_BASE_URL / LLM_MODEL) for generation

# 2. Frontend (separate shell, from repo root)
cd frontend
npm install
npm run dev                          # http://localhost:5173
```

Vite proxies `/api/*` → `http://localhost:8000` (see `vite.config.ts`), so the
browser stays same-origin in dev. The backend also allows the Vite origin via
CORS (`cors_origins` in `backend/app/config.py`).

## How it maps to requirements

- **Document scope (FR-Q2/Q4):** the left panel lists current PDFs grouped by
  category with include/exclude toggles; default scope is all `ready` documents.
  Only the selected `doc_ids` are sent with the query.
- **Cited answers (FR-Q6):** answers render with per-source `filename · p.N`
  chips.
- **Not covered (FR-Q7):** when the backend's score guard finds nothing
  relevant, the UI shows the "not covered in the selected guidelines" notice
  instead of an answer.

## Build

```bash
npm run build      # tsc -b && vite build -> dist/
```
