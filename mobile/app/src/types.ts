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
