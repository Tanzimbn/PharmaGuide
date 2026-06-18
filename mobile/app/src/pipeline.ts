// Ingestion orchestration — port of backend/app/ingestion/pipeline.py.
//
//   size guard -> documents row (processing) -> extract (service) -> page guard
//   -> chunk -> embed (on-device, CPU int8) -> one txn: insert chunks + ready
//
// On any failure after the row exists, the document is marked `failed` and the
// chunk transaction rolls back, so no partial chunks ever land (FR-A * parity,
// NFR-4). `populate` is the shared extract->chunk->embed->insert step reused by
// the atomic replace (lifecycle.ts).
import * as SQLite from "expo-sqlite";

import { chunkPages } from "./chunk";
import { EMBED_BATCH_SIZE } from "./config";
import { getDb, insertChunks, insertDocument, setStatus } from "./db";
import { Embedder } from "./embed";
import { extractPdf } from "./extractClient";
import { checkFileSize, checkPageCount } from "./guardrails";
import { newId } from "./ids";
import { ExtractResponse } from "./types";

// Load the embedder once and reuse the ORT session across ingests. CPU is the
// path: M0 found NNAPI is a net loss for int8 (mobile-m0-spike.md §9).
let _embedder: Promise<Embedder> | null = null;
function getEmbedder(): Promise<Embedder> {
  if (!_embedder) _embedder = Embedder.load("cpu");
  return _embedder;
}

async function embedAll(texts: string[]): Promise<Float32Array[]> {
  if (texts.length === 0) return [];
  const embedder = await getEmbedder();
  const out: Float32Array[] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBED_BATCH_SIZE);
    out.push(...(await embedder.embed(batch)));
  }
  return out;
}

export interface PreparedChunks {
  chunks: ReturnType<typeof chunkPages>;
  vectors: Float32Array[];
}

/** Chunk + embed (the slow part) WITHOUT touching the DB, so the caller can do
 *  the actual insert inside a short transaction (and so atomic replace doesn't
 *  hold a write lock while the old version is still live). */
export async function prepareChunks(extract: ExtractResponse): Promise<PreparedChunks> {
  const chunks = chunkPages(extract.pages);
  const vectors = await embedAll(chunks.map((c) => c.text));
  return { chunks, vectors };
}

/** Insert prepared chunks for `docId`. Call inside a transaction. */
export async function commitChunks(
  db: SQLite.SQLiteDatabase,
  docId: string,
  prepared: PreparedChunks,
): Promise<number> {
  await insertChunks(db, docId, prepared.chunks, prepared.vectors, newId);
  return prepared.chunks.length;
}

export interface IngestInput {
  uri: string;
  filename: string;
  category: string;
  sizeBytes: number;
}

export interface IngestResult {
  id: string;
  page_count: number;
  chunk_count: number;
}

/** Ingest one PDF into a new document + its chunks. */
export async function ingestDocument(input: IngestInput): Promise<IngestResult> {
  checkFileSize(input.sizeBytes); // before any DB write

  const id = newId();
  await insertDocument({
    id,
    filename: input.filename,
    category: input.category,
    status: "processing",
    page_count: 0, // filled once the service returns the real count
    added_at: new Date().toISOString(),
    version: 1,
  });

  try {
    const extract = await extractPdf(input.uri, input.filename);
    checkPageCount(extract.page_count);

    const db = await getDb();
    await db.runAsync(`UPDATE documents SET page_count = ? WHERE id = ?`, extract.page_count, id);

    const prepared = await prepareChunks(extract); // chunk + embed, no lock held

    let chunkCount = 0;
    await db.withTransactionAsync(async () => {
      chunkCount = await commitChunks(db, id, prepared);
      await db.runAsync(`UPDATE documents SET status = 'ready' WHERE id = ?`, id);
    });

    return { id, page_count: extract.page_count, chunk_count: chunkCount };
  } catch (e) {
    await setStatus(id, "failed"); // chunk txn already rolled back -> no partials
    throw e;
  }
}
