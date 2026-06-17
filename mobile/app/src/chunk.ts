// Page-aware chunking — direct port of backend/app/ingestion/chunk.py.
//
// Packs each page's blocks into chunks bounded by CHUNK_MAX_TOKENS with
// CHUNK_OVERLAP_TOKENS overlap between consecutive TEXT chunks. Every chunk keeps
// its page_number (OQ-2 page-level citation). Tables are never split: a table
// block becomes its own chunk (FR-R1), even if it exceeds the bound. Token counts
// are a whitespace-word approximation (the embedder does the real tokenization).
//
// Behavior must stay identical to the Python version — verified by the chunk
// parity check (mobile/tools/chunk_parity.mjs).
import { CHUNK_MAX_TOKENS, CHUNK_OVERLAP_TOKENS } from "./config";
import { Block, PageExtract } from "./types";

export interface ChunkData {
  page_number: number;
  text: string;
  token_count: number;
}

// \S+ — runs of non-whitespace (matches Python's re.compile(r"\S+")).
const WORD = /\S+/g;

export function countTokens(text: string): number {
  return (text.match(WORD) ?? []).length;
}

function words(text: string): string[] {
  return text.match(WORD) ?? [];
}

/** Split a text block into paragraph units (blank-line, else line). */
function paragraphs(text: string): string[] {
  let parts = text.trim().split(/\n\s*\n/);
  if (parts.length === 1) {
    parts = text.split(/\r?\n/).filter((ln) => ln.trim());
  }
  return parts.map((p) => p.trim()).filter((p) => p);
}

/** Split a too-large unit into overlapping word windows. */
function splitOversized(text: string, maxTok: number, overlapTok: number): string[] {
  const w = words(text);
  const step = Math.max(1, maxTok - overlapTok);
  const windows: string[] = [];
  for (let start = 0; start < w.length; start += step) {
    windows.push(w.slice(start, start + maxTok).join(" "));
    if (start + maxTok >= w.length) break;
  }
  return windows;
}

export function chunkPages(
  pages: PageExtract[],
  maxTokens: number = CHUNK_MAX_TOKENS,
  overlapTokens: number = CHUNK_OVERLAP_TOKENS,
): ChunkData[] {
  const chunks: ChunkData[] = [];

  for (const page of pages) {
    let buf: string[] = [];
    let bufTok = 0;

    const flush = (): void => {
      if (buf.length === 0) return;
      const text = buf.join("\n\n");
      chunks.push({ page_number: page.page_number, text, token_count: countTokens(text) });
      // Seed next buffer with the overlap tail (text continuity only).
      const tail = overlapTokens ? words(text).slice(-overlapTokens) : [];
      buf = tail.length ? [tail.join(" ")] : [];
      bufTok = tail.length;
    };

    for (const block of page.blocks as Block[]) {
      if (block.kind === "table") {
        flush();
        buf = []; // no overlap across a table boundary
        bufTok = 0;
        chunks.push({
          page_number: page.page_number,
          text: block.content,
          token_count: countTokens(block.content),
        });
        continue;
      }

      for (const para of paragraphs(block.content)) {
        const pTok = countTokens(para);
        if (pTok > maxTokens) {
          flush();
          buf = [];
          bufTok = 0;
          for (const window of splitOversized(para, maxTokens, overlapTokens)) {
            chunks.push({
              page_number: page.page_number,
              text: window,
              token_count: countTokens(window),
            });
          }
          continue;
        }
        if (bufTok + pTok > maxTokens) flush();
        buf.push(para);
        bufTok += pTok;
      }
    }

    flush();
  }

  return chunks;
}
