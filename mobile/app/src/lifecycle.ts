// Atomic replace + delete — port of backend/app/ingestion/lifecycle.py
// (FR-A2/A3, NFR-4).
//
// delete: remove a document; its chunks cascade (no stale content remains).
// replace: ingest the new version into a NEW id while the old stays live; only
// once the new version is fully extracted/embedded does a SINGLE transaction
// delete the old and flip the new to `ready`. On any failure the old version
// stays live and the half-built new row is discarded. There is no window where
// both versions are queryable, and none where neither is.
import { deleteDocumentRow, getDb, getDocument, insertDocument, setStatus } from "./db";
import { extractPdf } from "./extractClient";
import { checkFileSize, checkPageCount } from "./guardrails";
import { newId } from "./ids";
import {
  commitChunks,
  IngestInput,
  IngestResult,
  PreparedChunks,
  prepareChunks,
} from "./pipeline";

/** Delete a document and its chunks. Returns false if not found. */
export async function deleteDocument(id: string): Promise<boolean> {
  return deleteDocumentRow(id); // chunks cascade (NFR-4)
}

/** Atomically replace `oldId` with a freshly ingested new version. */
export async function replaceDocument(
  oldId: string,
  input: IngestInput,
): Promise<IngestResult> {
  checkFileSize(input.sizeBytes); // before any DB write — old stays live on reject

  const old = await getDocument(oldId);
  if (!old) throw new Error(`document ${oldId} not found`);

  const newDocId = newId();
  await insertDocument({
    id: newDocId,
    filename: input.filename,
    category: input.category,
    status: "processing", // invisible to queries until promoted
    page_count: 0,
    added_at: new Date().toISOString(),
    version: old.version + 1,
  });

  let prepared: PreparedChunks;
  let pageCount: number;
  try {
    const extract = await extractPdf(input.uri, input.filename);
    checkPageCount(extract.page_count);
    pageCount = extract.page_count;
    const db = await getDb();
    await db.runAsync(`UPDATE documents SET page_count = ? WHERE id = ?`, pageCount, newDocId);
    prepared = await prepareChunks(extract); // build new fully, old untouched
  } catch (e) {
    await deleteDocumentRow(newDocId); // discard half-built new; old still live
    throw e;
  }

  // Atomic promote: insert new chunks + delete old + flip new->ready, one txn.
  const db = await getDb();
  let chunkCount = 0;
  try {
    await db.withTransactionAsync(async () => {
      chunkCount = await commitChunks(db, newDocId, prepared);
      await deleteDocumentRow(oldId); // old chunks cascade
      await db.runAsync(`UPDATE documents SET status = 'ready' WHERE id = ?`, newDocId);
    });
  } catch (e) {
    await setStatus(newDocId, "failed");
    await deleteDocumentRow(newDocId);
    throw e; // old untouched and still live
  }

  return { id: newDocId, page_count: pageCount, chunk_count: chunkCount };
}
