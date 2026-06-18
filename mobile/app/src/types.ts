// Shared DTOs for the ingestion pipeline (M1).
//
// `Block` / `PageExtract` / `ExtractResponse` mirror the extraction service JSON
// (mobile/extract-service/main.py). `DocStatus` mirrors the web app's document
// lifecycle (backend/app/models). These are the §11 "shared types" — duplicated
// by hand for now, not yet a shared package.

export type BlockKind = "text" | "table";

export interface Block {
  kind: BlockKind;
  content: string;
}

export interface PageExtract {
  page_number: number; // 1-based
  blocks: Block[];
}

export interface ExtractResponse {
  page_count: number;
  pages: PageExtract[];
}

export type DocStatus = "processing" | "ready" | "failed";

export interface DocumentRow {
  id: string;
  filename: string;
  category: string;
  status: DocStatus;
  page_count: number;
  added_at: string; // ISO 8601
  version: number;
}

// --- Query path (M2) — mirror backend/app/query + schemas.py ---

/** A chunk returned from kNN retrieval, with its cosine similarity (0..1). */
export interface RetrievedChunk {
  chunk_id: string;
  doc_id: string;
  filename: string;
  page_number: number; // citation source
  text: string;
  similarity: number; // cosine, 0..1 (vectors are L2-normalized)
}

/** Page-level source reference (OQ-2). Mandatory on every grounded answer. */
export interface Citation {
  doc_id: string;
  filename: string;
  page: number;
}

/** Result of a query. `not_covered` true => citations empty (FR-Q7). */
export interface AnswerOut {
  answer: string;
  citations: Citation[];
  not_covered: boolean;
}
