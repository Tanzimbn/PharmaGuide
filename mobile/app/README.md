# PharmaGuide mobile (Track B)

On-device RAG app. Graduated from the M0 inference spike (which proved bge-small
runs on-device, CPU int8; see `docs/mobile-m0-spike.md` §9–10). Phases done:
**M1 — on-device ingestion** (pick PDF → extract → chunk → embed → SQLite, with
status lifecycle + atomic replace/delete) and **M2 — on-device query** (embed →
brute-force kNN → score guard → hosted LLM → grounded, page-cited answer +
"not covered" fallback). Real docs UI is M3; BYO-key + secure storage is M4.
Spec: [`docs/mobile.md`](../../docs/mobile.md).

Use **non-confidential sample PDFs only** (NFR-2): generation/extraction are not
yet on-device.

## Architecture (M1)

```
pick PDF (expo-document-picker)
  → POST to extraction service (Python pdfplumber, table-aware)   ← only network hop
  → chunkPages   (src/chunk.ts, parity-checked vs backend)
  → Embedder     (src/embed.ts, ONNX bge-small int8, CPU)
  → SQLite       (src/db.ts, embeddings as Float32 BLOB; sqlite-vec deferred to M2)
status: processing → ready | failed (atomic; no partial chunks)
```

The extraction service runs off-device because on-device PDF text APIs flatten
tables (FR-R1). See [`mobile/extract-service`](../extract-service/README.md).

## 1. One-time setup (laptop)

Export the ONNX models (writes `assets/models/**`):
```bash
cd ../tools && source ../../backend/.venv/bin/activate
pip install -r requirements.txt
python export_onnx.py      # must print PARITY PASSED
```

Start the extraction service and note your LAN IP:
```bash
cd ../extract-service && pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8001
ipconfig getifaddr en0     # macOS — put this in src/config.ts EXTRACT_BASE_URL
```

Set `EXTRACT_BASE_URL` in `src/config.ts` to `http://<that-ip>:8001`.

For M2 query, also set the LLM endpoint in `src/config.ts`: paste a trial key
into `LLM_API_KEY` (`LLM_BASE_URL`/`LLM_MODEL` default to Groq's free trial). Dev
only — M4 moves the key into secure storage. **NFR-2: non-confidential sample
PDFs only** — retrieved chunks leave the device to the hosted LLM. Do not commit
a real key.

## 2. Build the dev client (native modules → not Expo Go)

```bash
npm install
npx expo prebuild --clean   # config plugins reapply the Kotlin + ORT pins
npm run android             # physical device (M0: CPU int8 is the path)
```

Build pins that survive `prebuild --clean` (don't hand-edit android/ — it's
regenerated): Kotlin 1.9.24 via `expo-build-properties` (app.json), onnxruntime
AAR 1.20.0 via `plugins/withOnnxRuntimePin.js`, `.onnx` assetExts via
`metro.config.js`.

## 3. Verify M1 / M2

- **Parity (laptop):** `cd ../tools` then
  - `python chunk_parity.py && npx tsx chunk_parity.ts` → `CHUNK PARITY PASSED`
    (TS chunker == backend chunker).
  - `python query_parity.py && npx tsx query_parity.ts` → `QUERY PARITY PASSED`
    (prompt/citations byte-identical to web; brute-force kNN == numpy cosine).
- **Device (M1):** pick a sample PDF → status `processing`→`ready`, chunks > 0,
  pages populated. **Replace** bumps version, old chunks gone. **Delete** removes
  rows. Kill the service mid-ingest → status `failed`, zero partial chunks.
  "Dump DB" shows per-chunk page_number/token_count/preview.
- **Device (M2):** in the Query section, ask a question answerable from the PDF →
  grounded answer + ≥1 citation (`filename · p.N`). Ask an off-topic question →
  exactly "Not covered in the selected guidelines." with the NOT COVERED badge.
  Scope chips constrain retrieval to selected docs (none = all ready). Bad/empty
  `LLM_API_KEY` → user-facing error, no crash.

## Out of scope (M3+)

Reranker on-device + SentencePiece tokenizer, sqlite-vec, BYO-key entry + secure
storage / settings (M4), gold-set accuracy + score-threshold calibration +
latency/battery tuning (M5), real docs/query UI (M3).
