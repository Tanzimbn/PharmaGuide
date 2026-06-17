// LLM adapter (M2) — port of backend/app/query/llm.py. The single swap point for
// generation (arch §7): an OpenAI-compatible /chat/completions call behind a
// config const so the hosted trial endpoint can be swapped for in-VPC/on-device
// later (NFR-2). Generation is deterministic (temperature 0, FR-R4).
//
// SYSTEM_PROMPT, buildContext, and buildUserPrompt are kept BYTE-IDENTICAL to the
// web app (parity-checked in tools/query_parity) so on-device answers match the
// shared groundedness contract: answer only from the numbered context (FR-R3),
// mandatory page citations (FR-Q6/OQ-2), and the exact "not covered" escape hatch.
import { LLM_API_KEY, LLM_BASE_URL, LLM_MAX_TOKENS, LLM_MODEL, LLM_TIMEOUT_MS } from "./config";
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

/** Call the configured OpenAI-compatible endpoint (temperature 0). */
export async function generate({
  system,
  user,
}: {
  system: string;
  user: string;
}): Promise<string> {
  if (!LLM_API_KEY) {
    throw new Error(
      "LLM_API_KEY is not set in src/config.ts; cannot reach the generation endpoint.",
    );
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), LLM_TIMEOUT_MS);

  let resp: Response;
  try {
    resp = await fetch(`${LLM_BASE_URL.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LLM_API_KEY}`,
      },
      body: JSON.stringify({
        model: LLM_MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0, // FR-R4 deterministic generation
        max_tokens: LLM_MAX_TOKENS,
      }),
      signal: ctrl.signal,
    });
  } catch (e) {
    throw new Error(`LLM request failed (network/timeout) at ${LLM_BASE_URL}: ${String(e)}`);
  } finally {
    clearTimeout(timer);
  }

  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    throw new Error(`LLM call failed (HTTP ${resp.status}): ${detail}`);
  }

  const json = (await resp.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = json.choices?.[0]?.message?.content;
  if (content == null) throw new Error("LLM response had no choices[0].message.content");
  return content;
}
