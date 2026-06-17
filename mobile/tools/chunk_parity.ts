// Chunk-parity check (M1 verification). Reads extract.json + py_chunks.json
// produced by chunk_parity.py, runs the ported TS chunker on the same input, and
// asserts the output matches the Python chunker exactly (count, page_number,
// token_count, text). Run with: npx tsx chunk_parity.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { chunkPages } from "../app/src/chunk";
import { PageExtract } from "../app/src/types";

const here = import.meta.dirname;

type PyChunk = { page_number: number; text: string; token_count: number };

function checkCase(name: string): string[] {
  const pages: PageExtract[] = JSON.parse(readFileSync(join(here, `${name}_extract.json`), "utf8"));
  const py: PyChunk[] = JSON.parse(readFileSync(join(here, `${name}_chunks.json`), "utf8"));
  const ts = chunkPages(pages);

  const problems: string[] = [];
  if (ts.length !== py.length)
    problems.push(`[${name}] chunk count: TS ${ts.length} vs Python ${py.length}`);
  const n = Math.min(ts.length, py.length);
  for (let i = 0; i < n; i++) {
    if (ts[i].page_number !== py[i].page_number)
      problems.push(`[${name}] chunk ${i} page_number: TS ${ts[i].page_number} vs PY ${py[i].page_number}`);
    if (ts[i].token_count !== py[i].token_count)
      problems.push(`[${name}] chunk ${i} token_count: TS ${ts[i].token_count} vs PY ${py[i].token_count}`);
    if (ts[i].text !== py[i].text)
      problems.push(
        `[${name}] chunk ${i} text differs:\n  TS: ${JSON.stringify(ts[i].text)}\n  PY: ${JSON.stringify(py[i].text)}`,
      );
  }
  if (!problems.length) console.log(`  [${name}] ${ts.length} chunks identical (page, tokens, text).`);
  return problems;
}

const problems = [...checkCase("sample"), ...checkCase("synthetic")];
if (problems.length) {
  console.error("CHUNK PARITY FAILED:\n" + problems.join("\n"));
  process.exit(1);
}
console.log("CHUNK PARITY PASSED.");
