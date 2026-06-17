// On-device retrieval (M2) — port of backend/app/query/retrieve.py.
//
// Brute-force kNN over the stored chunk embeddings (no sqlite-vec; M2 decision):
// embed the query with the SAME model + CLS-pool + L2-norm as ingest, then score
// every ready chunk by cosine similarity and keep the top-k. Both query and
// chunk vectors are L2-normalized, so cosine == dot product. Scope is
// constrained to `ready` documents and an optional doc_id set (FR-Q4/Q8).
import { QUERY_TOP_K } from "./config";
import { fetchReadyChunks } from "./db";
import { Embedder } from "./embed";
import { RetrievedChunk } from "./types";

// Lazy singleton — load the embedder once and reuse across queries. CPU is the
// path on-device (M0: NNAPI is a net loss for int8 dynamic-quant).
let _embedder: Promise<Embedder> | null = null;
function getEmbedder(): Promise<Embedder> {
  if (!_embedder) _embedder = Embedder.load("cpu");
  return _embedder;
}

/** Cosine of two equal-length L2-normalized vectors (== dot product). */
function dot(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

export interface RetrieveOptions {
  docIds?: string[];
  topK?: number;
}

/** Embed the question and return the top-k most similar ready chunks. */
export async function retrieve(
  question: string,
  { docIds, topK }: RetrieveOptions = {},
): Promise<RetrievedChunk[]> {
  const candidates = await fetchReadyChunks(docIds);
  if (!candidates.length) return [];

  const embedder = await getEmbedder();
  const [qvec] = await embedder.embed([question]);

  const scored: RetrievedChunk[] = candidates.map((c) => ({
    chunk_id: c.chunk_id,
    doc_id: c.doc_id,
    filename: c.filename,
    page_number: c.page_number,
    text: c.text,
    similarity: dot(qvec, c.embedding),
  }));

  scored.sort((a, b) => b.similarity - a.similarity);
  return scored.slice(0, topK ?? QUERY_TOP_K);
}
