# System Architecture — Guideline Compliance Chatbot (MVP)

**Version:** 0.1
**Date:** 15.06.2026
**Status:** Ready for implementation planning

> **Product tracks.** This document is **Track A — the web app**: a shared,
> admin-curated corpus with server-side models (phases P1–P5). A second
> **Track B — a personal, on-device React Native mobile app** is specified
> separately in [`mobile.md`](mobile.md). The tracks share the groundedness
> contract and much TypeScript logic but differ in corpus ownership, where
> models run, and storage. Track A is unchanged by Track B and remains the
> source of truth for the web product.

---

## 1. Core principles

- **Groundedness first** (NFR-1): answer only from retrieved chunks, page-cited, with a "not covered" guard.
- **Swappable LLM**: hosted free-trial endpoint now, on-device small LLM later — behind a single adapter interface.
- **Local embeddings + rerank**: free, private, minimal data egress (only top reranked chunks reach the hosted LLM).
- **Atomic doc lifecycle**: old version stays live until the new version is fully ingested.

---

## 2. Resolved decisions (driving this design)

| Topic | Decision |
| --- | --- |
| Corpus size | ~48 PDFs, 12–50 pp each (~600–2,400 pages). Small. |
| Vector store | **pgvector on Postgres** (handles current + 10× growth) |
| PDF nature | Native text (no OCR needed); some embedded figures |
| Figures | Skip pixels; keep caption text as indexed/citable content |
| Citation granularity (OQ-2) | **Page-level** |
| Model hosting | **Free-trial hosted LLM** for MVP; on-device small LLM later |
| Embeddings + reranker | Run **local** (free + private) |
| Auth (OQ-4) | **None** for MVP; add later |
| Audit archive (OQ-1) | **Deferred** to post-MVP |

---

## 3. Component diagram

```
┌─────────────┐         ┌──────────────┐
│  ADMIN UI   │         │  QUERY UI    │
│  (React)    │         │  (React)     │
└──────┬──────┘         └──────┬───────┘
       │ upload/replace/delete │ question + selected_doc_ids
       ▼                       ▼
┌────────────────────────────────────────┐
│           FastAPI backend               │
│  ┌──────────────┐   ┌────────────────┐  │
│  │ Ingestion svc │   │ Retrieval svc  │  │
│  └──────┬───────┘   └───────┬────────┘  │
└─────────┼───────────────────┼───────────┘
          │                   │
   extract→chunk→embed   embed query
          │             filter doc_ids
          │             vec search→rerank
          │             grounded-gen guard
          ▼                   ▼
   ┌──────────────────────────────┐
   │   Postgres + pgvector        │
   │   documents(id,name,cat,     │
   │     status,page_count)       │
   │   chunks(id,doc_id,page,     │
   │     text,embedding,bbox?)    │
   └──────────────────────────────┘
          ▲                   │
          │            top-k chunks
          │                   ▼
          │            ┌─────────────┐
          └────────────│ LLM adapter │  (hosted trial now)
                       └─────────────┘
```

---

## 4. Data model (Postgres)

```sql
documents(
  id uuid pk, filename text, category text,
  status text,         -- processing | ready | failed
  page_count int, uploaded_at timestamptz, version int
)

chunks(
  id uuid pk, doc_id uuid fk -> documents,
  page_number int,     -- citation source (OQ-2: page-level)
  text text,
  embedding vector(N), -- N = embedding model dim
  token_count int
)

-- HNSW index on chunks.embedding
-- btree index on chunks.doc_id (selection filter)
```

No section column — page-level citation only. Simpler chunking, no section parsing.

---

## 5. Ingestion pipeline (P1)

```
upload PDF
  → create documents row, status=processing
  → pdfplumber: extract text + tables per page
       tables → structured (markdown / cell-preserved), NOT flattened (FR-R1)
       figures → caption text only, skip pixels
  → chunk per page (each chunk carries page_number)
  → embed (local sentence-transformer, e.g. bge-small)
  → bulk insert chunks
  → status=ready
on fail → status=failed, no partial chunks committed
```

**Atomic replace (FR-A3):**

```
new upload for existing doc:
  ingest NEW into a new doc_id (status=processing)
  on ready: single txn → delete old chunks+row, promote new
  on fail:  old stays live, new discarded
```

Old version never goes dark mid-reingest. Satisfies NFR-4 (index consistency, no stale content).

---

## 6. Retrieval pipeline (P2)

```
query + selected_doc_ids[]
  → embed query (same local model)
  → pgvector search WHERE doc_id IN (selected)   -- FR-Q4 / FR-Q8
       top-k (e.g. 20)
  → local cross-encoder rerank (bge-reranker) → top-n (e.g. 5)   -- FR-R2
  → if top score < threshold → "not covered in selected guidelines"  -- FR-Q7
  → else LLM adapter: prompt = system(grounded rules) + chunks + question
       temperature 0   -- FR-R4
  → return answer + citations[{filename, page}]   -- FR-Q6
```

---

## 7. LLM adapter (swap point)

```python
class LLMProvider(Protocol):
    def generate(self, system: str, context: list[Chunk], q: str) -> Answer: ...

# MVP:   HostedTrialProvider  (free-trial endpoint)
# later: OnDeviceProvider     (Ollama / llama.cpp, small model e.g. Llama 3.2 3B, Phi, Qwen)
```

Grounded prompt enforces: answer only from provided context, cite page, say "not covered" if absent (FR-R3). Belt-and-suspenders with the retrieval-score guard.

---

## 8. Latency budget (NFR-3, ~few seconds)

| Stage | Target |
| --- | --- |
| query embed (local) | <100 ms |
| pgvector search | <50 ms (small corpus) |
| rerank top-20 (local cross-encoder) | 200–500 ms (CPU); faster on GPU |
| LLM gen (hosted) | 1–3 s |
| **total** | **~2–4 s** |

Rerank on CPU is the main local cost. If tight, cut top-k to 10.

---

## 9. Upload guardrails

- **Per-file**: reject if > ~150 pages or > ~50 MB (hard reject at upload — protects pipeline).
- **Total corpus**: soft alert to admin, no block (never hard-block a valid guideline upload).

---

## 10. Explicit MVP assumptions (carry into production)

1. **Free-trial hosted LLM** → must swap to in-VPC / on-device for NFR-2 (data residency) before real confidential data. Adapter makes this config-only.
2. **No auth** → add before multi-user production (OQ-4).
3. **No audit archive** → revisit if a regulator requires version history (OQ-1).
4. MVP test data should be **non-confidential samples** while on the free-trial LLM.

---

## 11. Build order (maps to mvp.md §9 phases)

P1 ingestion core → P2 retrieval + gen → P3 doc-selection toggles → P4 admin UI → P5 eval/gold-set + latency tune.

---

## 12. Candidate stack (MVP)

| Layer | Choice |
| --- | --- |
| Backend | FastAPI |
| PDF extract | pdfplumber (native text + tables, page + bbox) |
| Embeddings | local sentence-transformer (e.g. bge-small) |
| Vector store | Postgres + pgvector (HNSW) |
| Reranker | local cross-encoder (e.g. bge-reranker) |
| LLM (gen) | free-trial hosted endpoint (behind adapter) |
| Frontends | React (admin + query) |
