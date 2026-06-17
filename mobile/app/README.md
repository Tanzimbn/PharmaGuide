# PharmaGuide mobile (Track B)

On-device RAG app. Graduated from the M0 inference spike (which proved bge-small
runs on-device, CPU int8; see `docs/mobile-m0-spike.md` §9–10). Current phase:
**M1 — on-device ingestion** (pick PDF → extract → chunk → embed → SQLite, with
status lifecycle + atomic replace/delete). Query, real UI, and the LLM call are
M2–M4. Spec: [`docs/mobile.md`](../../docs/mobile.md).

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

## 3. Verify M1

- **Chunk parity (laptop):** `cd ../tools && python chunk_parity.py && npx tsx
  chunk_parity.ts` → `CHUNK PARITY PASSED` (TS chunker == backend chunker).
- **Device:** pick a sample PDF → status `processing`→`ready`, chunks > 0, pages
  populated. **Replace** bumps version, old chunks gone. **Delete** removes rows.
  Kill the service mid-ingest → status `failed`, zero partial chunks. "Dump DB"
  shows per-chunk page_number/token_count/preview.

## Out of scope (M2+)

kNN/retrieval, reranker on-device + SentencePiece tokenizer, score-threshold
guard, LLM call, BYO-key secure storage, real docs UI.
