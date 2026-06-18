// Grounded prompt construction — port of backend/app/query/llm.py's prompt
// pieces. Kept in its own module (no network/native imports) so it stays a pure,
// deterministic string layer: importable by the parity check under plain Node,
// and free of the secure-store dependency that llm.ts now pulls in (M4).
//
// SYSTEM_PROMPT / buildContext / buildUserPrompt are BYTE-IDENTICAL to the web
// app (parity-checked in tools/query_parity) so on-device answers honor the same
// groundedness contract: answer only from the numbered context (FR-R3),
// mandatory page citations (FR-Q6/OQ-2), exact "not covered" escape hatch.
import { RetrievedChunk } from "./types";

export const SYSTEM_PROMPT =
  "You are PharmaGuide, a compliance assistant for pharmaceutical " +
  "manufacturing guidelines. Answer ONLY using the numbered context " +
  "passages provided below. Do not use any outside or prior knowledge.\n" +
  "- Every factual statement must cite its source as (filename, p.N) using " +
  "the filename and page shown on the passage it came from.\n" +
  "- Preserve numeric values, units, and table figures exactly.\n" +
  '- If the context does not contain the answer, reply exactly: ' +
  '"Not covered in the selected guidelines." and nothing else.';

/** Render retrieved chunks into a numbered, citation-tagged context block. */
export function buildContext(chunks: RetrievedChunk[]): string {
  return chunks
    .map((c, i) => `[${i + 1}] (filename: ${c.filename}, p.${c.page_number})\n${c.text}`)
    .join("\n\n");
}

export function buildUserPrompt(question: string, chunks: RetrievedChunk[]): string {
  return `Context passages:\n\n${buildContext(chunks)}\n\nQuestion: ${question}`;
}
