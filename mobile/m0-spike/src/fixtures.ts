// Synthetic workloads for the benchmarks. Short pharma-flavored strings — the
// spike measures throughput/latency, not answer quality, so exact content is
// irrelevant; sequence lengths just need to be realistic.

// Must match PARITY_SENTENCES in tools/export_onnx.py exactly (tokenizer id check).
export const PARITY_SENTENCES = [
  "Sterile products must be manufactured under controlled conditions.",
  "The acceptable daily exposure limit is 100 micrograms per day.",
  "What is the maximum holding time for bulk solution?",
];

// Expected Python embedding-tokenizer ids, emitted by export_onnx.py.
// (Generated file; present after running the export step.)
export const EXPECTED_IDS: Record<string, number[]> = require("../assets/tokenizer_parity.json");

const BASE = [
  "Sterile products must be manufactured under controlled conditions.",
  "Cleaning validation requires documented acceptance criteria for residues.",
  "The acceptable daily exposure limit is 100 micrograms per day.",
  "Environmental monitoring shall be performed in all grade A and B zones.",
  "Each batch record must be reviewed and approved before product release.",
  "Bulk solution may be held for no longer than 24 hours before filling.",
  "Out-of-specification results trigger a formal investigation procedure.",
  "Water for injection must meet conductivity and endotoxin limits.",
  "Equipment qualification covers installation, operation, and performance.",
  "Deviations must be documented, assessed for impact, and closed on time.",
];

/** N short passages for the bulk-embed (ingest) benchmark. */
export function passages(n = 200): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(`${BASE[i % BASE.length]} (item ${i + 1})`);
  return out;
}

/** (query, passage) pairs for the rerank benchmark. */
export function pairs(n = 20): [string, string][] {
  const q = "maximum holding time for bulk solution";
  const ps = passages(n);
  return ps.map((p) => [q, p]);
}
