# Extraction service (Track B mobile, M1)

Stateless PDF → per-page text + table-markdown JSON, for the on-device ingestion
pipeline. The mobile app POSTs a PDF; chunk/embed/store then run on the phone.
Extraction logic is ported from `backend/app/ingestion/extract.py` (kept torch-
free so it deploys on free-tier hosting). **Stores nothing.**

Use **non-confidential sample PDFs only** (NFR-2): the PDF transits this service.

## Run (dev)

```bash
cd mobile/extract-service
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8001       # 0.0.0.0 so the phone can reach it
```

The phone must hit your laptop's LAN IP, not localhost. Find it with
`ipconfig getifaddr en0` (macOS) and set that as the base URL in the app
(`mobile/app/src/extractClient.ts`), e.g. `http://192.168.1.20:8001`.

## API

```
GET  /health   -> {"status":"ok"}
POST /extract  (multipart field `file`, a PDF)
   -> {"page_count": N,
       "pages": [{"page_number": 1,
                  "blocks": [{"kind": "text"|"table", "content": "..."}]}]}
```

Tables are rendered as GitHub-flavored markdown (FR-R1), never flattened.

## Smoke test

```bash
curl -F file=@sample.pdf http://localhost:8001/extract | python -m json.tool
```
