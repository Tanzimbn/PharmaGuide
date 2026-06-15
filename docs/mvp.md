# Guideline Compliance Chatbot — Requirements

**Version:** 0.1&#x20;

**Audience:** pharmaceutical manufacturing

**Date:** _15.06.2026_

***

## 1. Summary

An internal tool that lets manufacturing engineers ask natural-language questions and receive answers grounded **only** in the company's own guideline documents (Safety, Maintenance, Quality, etc.). Every answer cites the source document and section. Guidelines live as separate PDFs, are managed by a non-technical admin, and change over time (add / remove / replace).

The system is a Retrieval-Augmented Generation (RAG) application: it retrieves the relevant passages from the guideline corpus and generates an answer constrained to that retrieved text, rather than relying on the language model's general knowledge.

***

## 2. Problem statement

Company guidelines are spread across multiple dense PDFs containing a lot of tabular data (limits, intervals, torque specs, parameters). Engineers on the floor need fast, correct answers to specific questions ("what is the maintenance interval for X?", "what PPE does procedure Y require?") but currently must manually search across documents. This is slow, error-prone, and depends on knowing which document holds the answer.

The tool must reduce lookup time while remaining trustworthy enough for a regulated manufacturing environment — meaning answers must be source-cited and must never fabricate guidance.

***

## 3. Users & roles

| Role                      | Who                                                | What they do                                                           |
| ------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------- |
| **Engineer (query user)** | Mechanical / electrical engineers in manufacturing | Ask questions, select which documents are in scope, read cited answers |
| **Admin**                 | Non-technical document owner                       | Add, remove, and replace guideline PDFs; assign category               |

***

## 4. Scope

### 4.1 In scope (MVP)

- Admin web UI to upload, categorize, replace, and delete guideline PDFs
- Automatic ingestion of PDFs on upload, including **table-aware extraction**
- Natural-language query interface for engineers
- **Document-level selection**: user chooses which PDFs are in scope for a query (default = all)
- Retrieval constrained to the user's selected documents
- Answers with **mandatory citations** (document name + section / page)
- "Not covered in the selected guidelines" response when no relevant content is found
- **Replace = atomic delete-then-reingest**; only the newest version of a document is ever live

### 4.2 Out of scope (deferred to v2+)

- Version history / "what did the guideline say last quarter" audit trail (see §7, Open Questions)
- Dual-track (hypothetical-answer / QA-RAG) retrieval — add only if retrieval precision proves insufficient
- Separate structured numeric "FACTS" store for hard table lookups
- User accounts / per-user permissions beyond the admin/engineer split
- Multi-language support
- Integration with external/live regulatory sources

***

## 5. Functional requirements

### 5.1 Document management (Admin)

| ID    | Requirement                                                                                                                                                              |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| FR-A1 | Admin can upload a PDF and assign it a category (e.g. Safety, Maintenance, Quality).                                                                                     |
| FR-A2 | Admin can delete a document; all of its indexed content is purged from the search index.                                                                                 |
| FR-A3 | Admin can replace a document; the old version's content is removed and the new version ingested as a single atomic operation. Only the newest version is ever queryable. |
| FR-A4 | The UI shows ingestion status per document (e.g. *processing → ready → failed*) so the admin knows when a document is live.                                              |
| FR-A5 | Admin can view the current list of all documents with their category and status.                                                                                         |
| FR-A6 | The admin requires no technical knowledge — no code, scripts, or direct database access.                                                                                 |

### 5.2 Querying (Engineer)

| ID    | Requirement                                                                                                      |
| ----- | ---------------------------------------------------------------------------------------------------------------- |
| FR-Q1 | User can enter a natural-language question.                                                                      |
| FR-Q2 | The query UI lists all current guideline PDFs (optionally grouped by category) with include/exclude toggles.     |
| FR-Q3 | Default state: **all documents selected**. The user may deselect documents to ignore, or select a subset.        |
| FR-Q4 | Retrieval is constrained to the user's selected document set only.                                               |
| FR-Q5 | The document list reflects the live corpus — added/removed documents appear/disappear without manual UI updates. |
| FR-Q6 | Every answer cites the specific source document(s) and section/page it drew from.                                |
| FR-Q7 | If no relevant content exists in the selected documents, the system says so explicitly rather than guessing.     |
| FR-Q8 | Citations reference only documents the user had selected for that query.                                         |

### 5.3 Retrieval & answering

| ID    | Requirement                                                                                                     |
| ----- | --------------------------------------------------------------------------------------------------------------- |
| FR-R1 | Tables are extracted structurally (not flattened to raw text) so numeric/tabular answers stay correct.          |
| FR-R2 | Retrieved candidates are reranked before answer generation to maximize relevance.                               |
| FR-R3 | Answers are generated only from retrieved guideline text; the model does not supplement with outside knowledge. |
| FR-R4 | Generation uses deterministic settings (temperature 0) for numeric/tabular reliability.                         |

***

## 6. Non-functional requirements

| ID    | Requirement                                                                                                                             |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------- |
| NFR-1 | **Accuracy / groundedness**: answers must be traceable to source text; no fabricated guidance. This is the top priority.                |
| NFR-2 | **Data residency**: guideline content stays within the company environment (no third-party data leakage), consistent with pharma norms. |
| NFR-3 | **Latency**: query responses should return within a few seconds for a typical question.                                                 |
| NFR-4 | **Index consistency**: after any add/remove/replace, search results reflect the change with no stale (deleted/old-version) content.     |
| NFR-5 | **Maintainability**: ingestion of a new document must not require rebuilding the entire index.                                          |

***

## 7. Key design decisions & open questions

### Decided

- **Versioning model**: replace old, newest only. One source of truth at any time; the bot can never cite a retired procedure.
- **Filter model**: document-level include/exclude at query time (not just category). Category may be used to group documents in the UI for convenience.
- **Citations**: mandatory on every answer.

### Resolved

- **OQ-1 — Audit history**: **Deferred.** Not needed for current MVP. Revisit post-MVP once the system works, and if a regulator requires proving "on date X the guideline said Y".
- **OQ-2 — Document structure**: **Page-level citation.** Source PDFs are native text (some embedded figures, no scans). Chunks carry `page_number`; no section parsing required.
- **OQ-3 — Corpus size**: **~48 PDFs, 12–50 pages each (~600–2,400 pages). Small.** Resolves to **Postgres + pgvector** (handles current corpus and ~10× growth). Upload guardrails: hard-reject per-file > ~150 pp or > ~50 MB; soft alert (no block) on total-corpus growth.
- **OQ-4 — Access**: **No authentication for MVP** (focus on pipeline performance). Add before multi-user production.

### Model hosting (decided)

- MVP uses a **free-trial hosted LLM** for generation, behind a swappable adapter interface. Production will switch to an **on-device small LLM** (e.g. Llama 3.2 3B / Phi / Qwen) — config-only change.
- **Embeddings and reranker run locally** (free + private); only top reranked chunks reach the hosted LLM.
- **Assumption / NFR-2 caveat**: the free-trial hosted LLM sends retrieved chunks to a third party. MVP test data must be **non-confidential samples**; swap to in-VPC / on-device before real confidential guidelines.

***

## 8. Proposed architecture (reference)

```
ADMIN UI                          QUERY UI (engineers)
  │ upload / replace / delete       │ question + selected_doc_ids
  ▼                                 ▼
Ingestion service              Retrieval service
  • table-aware extract          • embed query
  • table-aware chunking         • filter: document_id IN (selected)
  • embed                        • vector search → rerank
  • store {chunk, doc_id,        • "not in selected guidelines" guard
    category, filename, status}  ▼
  • replace = purge doc_id     Answer + citation
    then re-ingest (atomic)       (filename + section/page)
        │                          ▲
        └────────► Vector DB ◄──────┘
                 (+ metadata)
```

**Chosen stack** (corpus size resolved → small): FastAPI backend; pdfplumber for table-aware native-text extraction; local embedding model + **Postgres/pgvector** vector store; local cross-encoder reranker; free-trial hosted LLM (behind a swappable adapter) for generation; React for both the admin and query frontends.

> See [`architecture.md`](architecture.md) for the full system design, data model, pipelines, and latency budget.

***

## 9. Phased delivery

| Phase                       | Deliverable                                                                                                 |
| --------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **P1 — Ingestion core**     | Table-aware extraction, chunking, embedding, vector store with per-document metadata; atomic replace/delete |
| **P2 — Query core**         | Retrieval + rerank + cited answer generation + "not covered" fallback (CLI or minimal UI)                   |
| **P3 — Document selection** | Query-time include/exclude toggles wired to live document list                                              |
| **P4 — Admin UI**           | Non-technical upload / categorize / replace / delete with ingestion status                                  |
| **P5 — Hardening**          | Accuracy evaluation on a gold question set, latency tuning, edge cases                                      |
| **v2 candidates**           | Dual-track (QA-RAG) retrieval, FACTS store for numeric tables, PDF audit archive                            |

***

## 10. Success criteria

- Engineers get correctly cited answers from the selected guidelines, faster than manual lookup.
- The bot returns "not covered" rather than a fabricated answer when content is absent.
- Admin can add/remove/replace documents with no technical help, and changes take effect with no stale results.
- A gold set of representative questions (built with engineers) passes an agreed accuracy threshold before rollout.

