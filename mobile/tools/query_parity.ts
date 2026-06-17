// Query-parity check (M2 verification). Reads the fixtures from query_parity.py
// and asserts the mobile query path matches the web app:
//   1. SYSTEM_PROMPT / buildContext / buildUserPrompt are byte-identical, and
//      citation dedup produces the same list (the groundedness contract).
//   2. The brute-force cosine ranking matches numpy (order + scores).
// Run: ../../backend/.venv/bin/python query_parity.py && npx tsx query_parity.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { SYSTEM_PROMPT, buildContext, buildUserPrompt } from "../app/src/llm";
import { RetrievedChunk } from "../app/src/types";

const here = import.meta.dirname;
const problems: string[] = [];

function eq(label: string, ts: string, py: string): void {
  if (ts !== py) problems.push(`${label} differs:\n  TS: ${JSON.stringify(ts)}\n  PY: ${JSON.stringify(py)}`);
}

// --- 1. prompt + citation parity ---
{
  const fx = JSON.parse(readFileSync(join(here, "query_prompt.json"), "utf8")) as {
    question: string;
    chunks: RetrievedChunk[];
    system_prompt: string;
    context: string;
    user_prompt: string;
    citations: { doc_id: string; filename: string; page: number }[];
  };

  eq("SYSTEM_PROMPT", SYSTEM_PROMPT, fx.system_prompt);
  eq("buildContext", buildContext(fx.chunks), fx.context);
  eq("buildUserPrompt", buildUserPrompt(fx.question, fx.chunks), fx.user_prompt);

  // Dedup per (doc_id, page), preserving order — must match answer.ts citations().
  const seen = new Set<string>();
  const ts: { doc_id: string; filename: string; page: number }[] = [];
  for (const c of fx.chunks) {
    const key = `${c.doc_id} ${c.page_number}`;
    if (seen.has(key)) continue;
    seen.add(key);
    ts.push({ doc_id: c.doc_id, filename: c.filename, page: c.page_number });
  }
  eq("citations", JSON.stringify(ts), JSON.stringify(fx.citations));
}

// --- 2. kNN ranking parity ---
{
  const fx = JSON.parse(readFileSync(join(here, "query_knn.json"), "utf8")) as {
    query: number[];
    vectors: number[][];
    order: number[];
    scores: number[];
  };
  const q = fx.query;
  const sims = fx.vectors.map((v) => v.reduce((s, x, i) => s + x * q[i], 0));
  const order = sims
    .map((s, i) => [i, s] as [number, number])
    .sort((a, b) => b[1] - a[1])
    .map(([i]) => i);

  if (JSON.stringify(order) !== JSON.stringify(fx.order))
    problems.push(`knn order differs:\n  TS: ${order.slice(0, 10)}…\n  PY: ${fx.order.slice(0, 10)}…`);
  const maxErr = Math.max(...fx.order.map((i, k) => Math.abs(sims[i] - fx.scores[k])));
  if (maxErr > 1e-9) problems.push(`knn score drift ${maxErr} > 1e-9`);
}

if (problems.length) {
  console.error("QUERY PARITY FAILED:\n" + problems.join("\n"));
  process.exit(1);
}
console.log("QUERY PARITY PASSED.");
