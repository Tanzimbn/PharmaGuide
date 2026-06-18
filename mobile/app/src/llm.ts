// LLM adapter — port of backend/app/query/llm.py. The single swap point for
// generation (arch §7): an OpenAI-compatible /chat/completions call. M4 reads
// the endpoint, model, and BYO key from runtime settings (secure storage) so the
// host can be swapped for in-VPC/on-device later (NFR-2). Generation is
// deterministic (temperature 0, FR-R4).
//
// The pure prompt builders (SYSTEM_PROMPT / buildContext / buildUserPrompt) live
// in ./prompt — kept native-import-free so the parity check can load them under
// plain Node. This module only does the network call.
import { LLM_MAX_TOKENS, LLM_TIMEOUT_MS } from "./config";
import { getSettings } from "./settings";

/** Call the configured OpenAI-compatible endpoint (temperature 0). */
export async function generate({
  system,
  user,
}: {
  system: string;
  user: string;
}): Promise<string> {
  const { llmApiKey, llmBaseUrl, llmModel } = getSettings();
  if (!llmApiKey) {
    throw new Error("No API key set. Add your LLM API key in the Settings tab.");
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), LLM_TIMEOUT_MS);

  let resp: Response;
  try {
    resp = await fetch(`${llmBaseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${llmApiKey}`,
      },
      body: JSON.stringify({
        model: llmModel,
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
    throw new Error(`LLM request failed (network/timeout) at ${llmBaseUrl}: ${String(e)}`);
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
