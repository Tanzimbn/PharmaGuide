# Mobile App Architecture — PharmaGuide (Track B)

**Version:** 0.1
**Date:** 16.06.2026
**Status:** Planning / pre-spike

> This is a **separate product track** from the web app. The web version
> (`docs/mvp.md` + `docs/architecture.md`, phases P1–P5) remains the source of
> truth for the **shared, admin-curated** corpus product and is unchanged.
> This document describes a **personal, on-device** mobile app. Where the two
> share logic it is called out (§11); otherwise treat them as distinct.

---

## 0. How the mobile product differs from the web product

| | Web (Track A) | Mobile (Track B, this doc) |
| --- | --- | --- |
| Corpus ownership | Central admin curates a shared corpus | **Each user manages their own PDFs** |
| Roles | Admin vs engineer (query) | **No roles** — every user is their own admin |
| Where models run | Server (CPU) | **On-device** (native ONNX Runtime) |
| Vector store | Postgres + pgvector | **SQLite + sqlite-vec on device** |
| Embeddings / rerank | Server | **On-device** |
| LLM generation | Hosted (shared) behind adapter | **Hosted, user's own (BYO) key** — app calls the endpoint directly |
| Hosting footprint | Full backend + DB | **None for the core loop** (optional extraction service only — §6) |
| Data egress | Top reranked chunks → LLM | Top reranked chunks → LLM (PDFs may transit an optional extraction service — see §6) |

The unifying idea: **push all heavy compute onto the phone** (where native
runtimes handle these small models well), leaving only a stateless LLM proxy to
host. This collapses Track A's P3 (query UI) and P4 (admin UI) into a single
**personal document screen**.

---

## 1. Core principles (inherited + new)

Inherited from Track A — **non-negotiable, ported verbatim**:
- **Groundedness first** (NFR-1): answer only from retrieved chunks, page-cited,
  with a double "not covered" guard (score threshold + grounded prompt).
- **Page-level citations** flow extract → chunk → store → citation.
- **Deterministic generation** (temperature 0, FR-R4).

New to mobile:
- **On-device first**: embeddings, vector store, and rerank never leave the
  device. Only the final generation step calls out (shared LLM).
- **Offline-capable**: ingest, store, retrieve, and re-read past answers work
  with no network; only asking a *new* question needs connectivity.
- **No central state**: the app is self-contained per install; there is no
  server-side corpus and no per-user account required for the core loop.

---

## 2. Resolved / proposed decisions

| Topic | Decision |
| --- | --- |
| Framework | **React Native** (iOS + Android) — reuses the team's React/TS skills and shares logic with the web app (§11). Native ONNX via `onnxruntime-react-native`. |
| On-device inference | **ONNX Runtime Mobile** — NNAPI/XNNPACK (Android), CoreML (iOS) execution providers. **Validate in spike M0.** |
| Embeddings | `BAAI/bge-small-en-v1.5` → **ONNX**, 384-dim (same model as web; results comparable). |
| Reranker | `BAAI/bge-reranker-base` → ONNX. **On-device cost TBD** (§12) — droppable on low-end devices. |
| Vector store | **SQLite + sqlite-vec** (or ObjectBox vector search). Brute-force/ANN kNN is trivial at personal-corpus scale. |
| PDF extraction | **Open decision** (§6): on-device native lib vs. a lightweight stateless server reusing pdfplumber (preserves table quality, FR-R1). |
| LLM generation | Hosted OpenAI-compatible endpoint, called **directly from the device**. Each user provides **their own API key (BYO)**, stored in device **secure storage** (iOS Keychain / Android Keystore). No proxy server for the MVP. |
| On-device LLM | **Future** — llama.cpp / MLC small model (Llama 3.2 1–3B / Phi / Qwen) for full data residency (NFR-2). Not in the first release. |
| Auth | **None** for the core loop. Add only when the shared proxy needs per-user rate limiting / quotas. |

---

## 3. Component diagram

```
┌──────────────────────────────────────────────┐
│              React Native app (device)         │
│  ┌────────────┐   ┌──────────────────────────┐ │
│  │  Personal  │   │  On-device pipeline       │ │
│  │  Docs UI   │   │  extract* → chunk → embed │ │
│  │ add/del/   │   │  → sqlite-vec store       │ │
│  │ replace +  │   │  query: embed → kNN →     │ │
│  │ status     │   │  rerank → score guard     │ │
│  └────────────┘   └────────────┬─────────────┘ │
│        SQLite + sqlite-vec       │ top-n chunks  │
│   key in secure storage (Keychain/Keystore)      │
└──────────────────────────────────┼──────────────┘
                                    │ (network only here; user's own key)
                                    ▼
                         ┌────────────────────────┐
                         │  Hosted LLM (BYO key)   │
                         └────────────────────────┘

* extraction may run on-device or in an optional stateless service (§6)
```

---

## 4. Data model (on-device SQLite)

```sql
documents(
  id text pk, filename text, category text,
  status text,        -- processing | ready | failed
  page_count int, added_at text, version int
)

chunks(
  id text pk, doc_id text references documents,
  page_number int,    -- citation source (page-level)
  text text,
  token_count int
)

-- sqlite-vec virtual table holding the 384-dim embeddings,
-- keyed to chunks.id; kNN by cosine.
vec_chunks(chunk_id text, embedding float[384])
```

Mirrors the web schema minus server concerns; `category` is now a personal,
free-text label the user assigns.

---

## 5. Ingestion pipeline (on-device)

```
user picks a PDF
  → create documents row, status=processing
  → extract text + tables per page  (location per §6)
  → chunk per page (each chunk carries page_number)
  → embed chunks on-device (ONNX bge-small, batched)
  → insert chunks + vectors (sqlite-vec)
  → status=ready
on fail → status=failed, no partial chunks
```

**Replace** keeps Track A's atomicity intent: ingest the new version fully,
then in one SQLite transaction delete the old doc's rows+vectors and promote the
new — old content never queryable alongside new.

---

## 6. PDF extraction — the key open decision

Table-aware extraction (FR-R1) is the one piece that doesn't port cleanly to the
device, because pdfplumber is Python.

- **Option A — On-device native lib** (e.g. PDFKit/PdfBox-Android or a JS pdf
  parser). Fully local, PDFs never leave the phone, but **weaker table
  fidelity** — a real risk for numeric/tabular pharma specs.
- **Option B — Stateless extraction service** reusing the existing pdfplumber
  code. Preserves table quality. PDFs transit a server, but since retrieved
  chunks already go to a shared LLM, the trust level is comparable. The service
  stores nothing and can sit on free-tier hosting (no torch, low memory).

**Lean:** Option B for table fidelity, unless raw-PDF privacy is a hard
requirement. Revisit after the M0 spike.

---

## 7. Query pipeline (on-device → shared LLM)

```
question (+ optional personal doc scope)
  → embed query on-device (ONNX bge-small)
  → sqlite-vec kNN over the user's chunks → top-k
  → on-device cross-encoder rerank → top-n        (FR-R2; droppable, §12)
  → if top score < threshold → "Not covered in your guidelines."  (FR-Q7)
  → else → POST top-n chunks + question to the LLM proxy
       proxy adds key, forwards to hosted LLM (temperature 0)      (FR-R4)
  → render grounded answer + page citations                       (FR-Q6)
```

Same groundedness contract as Track A; only the *location* of each step changes.

---

## 8. LLM access — bring-your-own key (MVP)

No server in the middle for the MVP. Each user supplies **their own** API key:
- The app calls the OpenAI-compatible endpoint **directly** from the device,
  reusing the web app's [`app/query/llm.py`](../backend/app/query/llm.py)
  request shape (system + context chunks + question, temperature 0).
- The key is the **user's own**, entered once and stored in **device secure
  storage** (iOS Keychain / Android Keystore) — never bundled in the app, never
  sent anywhere except the user's chosen LLM host over HTTPS.
- No shared secret to protect, no proxy to host → the core loop is serverless.

**When you'd add a proxy later (post-MVP):** only if you move to a *shared/
managed* key (so users don't each need their own), or need central rate
limiting, usage metering, or per-user quotas. Then a thin stateless proxy holds
the key and the app stops calling the host directly.

---

## 9. Data residency posture (NFR-2)

Strictly better than Track A's default:
- Embeddings, vectors, retrieval, rerank: **never leave the device**.
- Only **top reranked chunks** reach the shared LLM (and, under §6 Option B,
  raw PDFs reach the stateless extractor).
- **Caveat unchanged:** because generation is still hosted, use
  **non-confidential sample PDFs** until the on-device LLM (§2 future) lands —
  at which point the pipeline is fully local and real confidential guidelines
  become acceptable.

---

## 10. Latency / resource budget (mobile)

| Stage | Expectation (modern phone, native ONNX) |
| --- | --- |
| Ingest: embed a 50-page PDF | tens of seconds (one-time, batched) |
| Query embed (1 string) | <150 ms |
| sqlite-vec kNN (personal corpus) | <50 ms |
| Rerank top-k (cross-encoder) | sub-second (NNAPI/CoreML) |
| LLM gen (hosted) | 1–3 s |
| **Interactive query total** | **~2–4 s** |

Native inference is the whole reason this is viable on mobile — the same work in
a browser WASM runtime would be minutes for ingest and seconds per rerank.
Watch **battery/thermals** on bulk ingest; consider chunked/background embedding.

---

## 11. Code reuse between web and mobile

Share the platform-agnostic TypeScript via a workspace package (monorepo):
- Chunking rules and token counting
- Grounded **system prompt** + user-prompt/context builder
- Citation shaping / dedup logic
- API/DTO **types** (mirror of `backend/app/schemas.py`)

Diverges (rebuilt per platform):
- UI (React DOM vs React Native components)
- Storage (pgvector/HTTP vs SQLite+sqlite-vec)
- Inference (server torch vs on-device ONNX Runtime)

---

## 12. Open decisions / risks (resolve during M0–M1)

1. **ONNX execution providers** — confirm `onnxruntime-react-native` gives
   working NNAPI/XNNPACK (Android) + CoreML (iOS) acceleration for bge-small and
   the reranker. *Single biggest technical risk — spike first (M0).*
2. **Extraction location** (§6) — table fidelity vs full-local.
3. **Reranker on-device** — keep for relevance (FR-R2) or drop on low-end
   devices to save battery/latency and ~100 MB of model assets.
4. **Model delivery** — bundle ONNX models in the app vs first-run download
   (size vs install footprint).
5. **LLM key handling** — MVP is BYO key in device secure storage (no proxy).
   Revisit only if moving to a shared/managed key (§8).
6. **Distribution & updates** — App Store / Play Store review; OTA strategy for
   JS (e.g. CodePush-style) vs native release cadence.

---

## 13. Phased build order (Track B)

Mirrors Track A's phases but on-device. Prefixed **M** to avoid confusion with
the web **P** phases.

| Phase | Status | Deliverable |
| --- | --- | --- |
| **M0 — Inference spike** | ✅ done (🟡) | RN app loads bge-small as ONNX and embeds a string on-device on both iOS + Android with hardware acceleration. **De-risks the whole plan before further build.** Full checklist + pass/fail gates: [`mobile-m0-spike.md`](mobile-m0-spike.md). *Result: int8 runs + parity-verified on Android CPU; NNAPI a net loss for int8 dynamic-quant → CPU is the path.* |
| **M1 — On-device ingestion** | ✅ done | Pick PDF → extract (per §6) → chunk → embed on-device → store in SQLite; status processing→ready→failed. Atomic replace/delete. *Built in `mobile/app/` + `mobile/extract-service/` (off-device pdfplumber per §6 Option B). Chunker parity-checked vs backend `chunk_pages`. Embeddings stored as Float32 BLOB — sqlite-vec vs brute-force kNN deferred to M2.* |
| **M2 — On-device query** | ✅ done | embed query → kNN → rerank → score guard → shared-LLM-proxy call → grounded, page-cited answer + "not covered" fallback. *Built in `mobile/app/src/{retrieve,llm,answer}.ts`. **kNN = brute-force JS** over the BLOB vectors (sqlite-vec deferred — corpus is personal-scale). **Reranker dropped for M2** (needs an unbuilt SentencePiece tokenizer + ~3s/query; no gold set to justify it yet) → the FR-Q7 score guard runs on cosine similarity, threshold a placeholder for M5. LLM via OpenAI-compatible adapter + gitignored `.env` key (M4 = secure storage). Prompt/citations byte-parity-checked vs web.* |
| **M3 — Personal docs UI** | Single screen to add / categorize / replace / delete your own PDFs with live ingest status (merges Track A P3+P4). |
| **M4 — LLM settings & access** | BYO-key entry + secure storage (Keychain/Keystore), host/model settings, direct-call error/timeout/retry handling. |
| **M5 — Hardening** | Gold-set accuracy, latency/battery tuning, `score_threshold` calibration, on-device-LLM exploration for full residency. |

---

## 14. Candidate stack (Track B)

| Layer | Choice |
| --- | --- |
| App framework | React Native (iOS + Android), TypeScript |
| On-device inference | ONNX Runtime Mobile (`onnxruntime-react-native`) |
| Embeddings | bge-small-en-v1.5 (ONNX, 384-dim) |
| Reranker | bge-reranker-base (ONNX) — optional |
| Vector store | SQLite + sqlite-vec (or ObjectBox) |
| PDF extract | native lib **or** stateless pdfplumber service (§6) |
| LLM (gen) | hosted endpoint, called directly with user's BYO key (secure storage) |
| Future LLM | on-device small model (llama.cpp / MLC) for full residency |
