# PharmaGuide mobile (Track B)

On-device RAG app. Graduated from the M0 inference spike (which proved bge-small
runs on-device, CPU int8; see `docs/mobile-m0-spike.md` §9–10). Phases done:
**M1 — on-device ingestion** (pick PDF → extract → chunk → embed → SQLite, status
lifecycle + atomic replace/delete), **M2 — on-device query** (embed → brute-force
kNN → score guard → hosted LLM → grounded, page-cited answer + "not covered"
fallback), **M3 — docs UI** (real Library / Ask tabs), and **M4 — settings &
access** (BYO key in device secure storage; host/model/extract URL editable
in-app). Spec: [`docs/mobile.md`](../../docs/mobile.md).

Use **non-confidential sample PDFs only** (NFR-2): generation/extraction are not
yet on-device.

## Architecture

```
pick PDF (expo-document-picker)
  → POST to extraction service (Python pdfplumber, table-aware)   ← only network hop in ingest
  → chunkPages   (src/chunk.ts, parity-checked vs backend)
  → Embedder     (src/embed.ts, ONNX bge-small int8, CPU)
  → SQLite       (src/db.ts, embeddings as Float32 BLOB)
status: processing → ready | failed (atomic; no partial chunks)

ask: embed query → brute-force kNN (src/retrieve.ts) → score guard
  → OpenAI-compatible LLM (src/llm.ts, BYO key) → grounded answer (src/answer.ts)
```

Runtime config (BYO key, LLM base URL/model, extract URL) lives in
**`src/settings.ts`** backed by device secure storage (Keychain/Keystore); the
`DEFAULT_*` seeds in `src/config.ts` only apply on first run. The extraction
service runs off-device because on-device PDF APIs flatten tables (FR-R1); point
it at **your own** endpoint, never a shared host (NFR-2). See
[`mobile/extract-service`](../extract-service/README.md).

## 1. One-time setup (laptop)

Export the ONNX models (writes `assets/models/**`):
```bash
cd ../tools && source ../../backend/.venv/bin/activate
pip install -r requirements.txt
python export_onnx.py      # must print PARITY PASSED
```

Start the extraction service and note your LAN IP (you'll enter this in the app's
Settings tab, not in code):
```bash
cd ../extract-service && pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8001
ipconfig getifaddr en0     # macOS — the phone reaches this over wifi
```

> Dev shortcut: a gitignored `.env` (`EXPO_PUBLIC_*`, see `.env.example`) can
> seed the Settings defaults on a fresh install. It's optional — the real key is
> entered in-app and stored in secure storage, never committed.

## 2. Build the dev client (native modules → not Expo Go)

```bash
npm install
npx expo prebuild --clean   # config plugins reapply Kotlin + ORT + secure-store
npm run android             # physical device (M0: CPU int8 is the path)
```

Build pins that survive `prebuild --clean` (don't hand-edit android/ — it's
regenerated): Kotlin 1.9.24 via `expo-build-properties` (app.json), onnxruntime
AAR 1.20.0 via `plugins/withOnnxRuntimePin.js`, `.onnx` assetExts via
`metro.config.js`. `expo-secure-store` (M4) adds a native module → rebuild once
after pulling M4; JS-only changes hot-reload after that.

## 3. Use the app

- **Settings tab:** paste your LLM API key (stored in Keychain/Keystore), set the
  LLM base URL/model, and set the Extract service URL to `http://<LAN-IP>:8001`.
- **Library tab:** Add PDF → pick a category → ingest (processing → ready).
  Replace / Delete per document.
- **Ask tab:** type a question, optionally scope to specific docs (none = all
  ready), get a grounded answer with page citations or "not covered".

## 4. Verify

- **Parity (laptop):** `cd ../tools` then
  - `python chunk_parity.py && npx tsx chunk_parity.ts` → `CHUNK PARITY PASSED`.
  - `python query_parity.py && npx tsx query_parity.ts` → `QUERY PARITY PASSED`
    (prompt/citations byte-identical to web; brute-force kNN == numpy cosine).
- **Device:**
  - Settings: save a key → kill & relaunch the app → key still shows "✓ set"
    (secure-storage persistence). Clear key → Ask shows "Add your API key in
    Settings", no crash.
  - Library: add a sample PDF → `processing`→`ready` with page/chunk counts.
    Replace bumps version, old chunks gone. Delete removes the row.
  - Ask: question answerable from the PDF → grounded answer + ≥1 citation
    (`filename · p.N`). Off-topic / wrong scope → "Not covered in the selected
    guidelines." + NOT COVERED badge. Bad model id / network → inline error.

## Out of scope (M5)

On-device LLM (llama.cpp / MLC) for full residency, on-device extraction
(removing the network hop), gold-set accuracy + score-threshold calibration +
latency/battery tuning.
