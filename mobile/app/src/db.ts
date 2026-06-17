// On-device store (SQLite via expo-sqlite). Schema mirrors mobile.md §4.
//
// Embeddings are stored as a raw Float32 BLOB on `chunks` — NOT sqlite-vec.
// M1 has no query path, so no kNN is needed yet; storing the bytes keeps the
// sqlite-vec-vs-brute-force decision open for M2 and avoids that native-build
// risk now. Vectors round-trip Float32Array <-> Uint8Array (the BLOB type).
import * as SQLite from "expo-sqlite";

import { ChunkData } from "./chunk";
import { DocStatus, DocumentRow } from "./types";

const DB_NAME = "pharmaguide.db";

let _db: SQLite.SQLiteDatabase | null = null;

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS documents (
      id          TEXT PRIMARY KEY NOT NULL,
      filename    TEXT NOT NULL,
      category    TEXT NOT NULL,
      status      TEXT NOT NULL,
      page_count  INTEGER NOT NULL,
      added_at    TEXT NOT NULL,
      version     INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS chunks (
      id          TEXT PRIMARY KEY NOT NULL,
      doc_id      TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      page_number INTEGER NOT NULL,
      text        TEXT NOT NULL,
      token_count INTEGER NOT NULL,
      embedding   BLOB NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_chunks_doc ON chunks(doc_id);
  `);
  _db = db;
  return db;
}

/** Float32Array -> bytes for a BLOB bind param. */
function vecToBlob(v: Float32Array): Uint8Array {
  return new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
}

/** BLOB bytes -> Float32Array (M2 will use this for kNN). */
export function blobToVec(b: Uint8Array): Float32Array {
  // Copy so the view is aligned and owns its buffer.
  const copy = b.slice();
  return new Float32Array(copy.buffer, copy.byteOffset, copy.byteLength / 4);
}

export async function insertDocument(doc: DocumentRow): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO documents (id, filename, category, status, page_count, added_at, version)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    doc.id,
    doc.filename,
    doc.category,
    doc.status,
    doc.page_count,
    doc.added_at,
    doc.version,
  );
}

export async function setStatus(id: string, status: DocStatus): Promise<void> {
  const db = await getDb();
  await db.runAsync(`UPDATE documents SET status = ? WHERE id = ?`, status, id);
}

/** Insert all chunk rows for a document. Call inside a transaction. */
export async function insertChunks(
  db: SQLite.SQLiteDatabase,
  docId: string,
  chunks: ChunkData[],
  vectors: Float32Array[],
  newId: () => string,
): Promise<void> {
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    await db.runAsync(
      `INSERT INTO chunks (id, doc_id, page_number, text, token_count, embedding)
       VALUES (?, ?, ?, ?, ?, ?)`,
      newId(),
      docId,
      c.page_number,
      c.text,
      c.token_count,
      vecToBlob(vectors[i]),
    );
  }
}

export async function deleteDocumentRow(id: string): Promise<boolean> {
  const db = await getDb();
  const r = await db.runAsync(`DELETE FROM documents WHERE id = ?`, id);
  return r.changes > 0; // chunks cascade via FK
}

export async function getDocument(id: string): Promise<DocumentRow | null> {
  const db = await getDb();
  return db.getFirstAsync<DocumentRow>(`SELECT * FROM documents WHERE id = ?`, id);
}

export interface DocumentListItem extends DocumentRow {
  chunk_count: number;
}

export async function listDocuments(): Promise<DocumentListItem[]> {
  const db = await getDb();
  return db.getAllAsync<DocumentListItem>(
    `SELECT d.*, (SELECT COUNT(*) FROM chunks c WHERE c.doc_id = d.id) AS chunk_count
     FROM documents d ORDER BY d.added_at DESC`,
  );
}

export async function countChunks(docId: string): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM chunks WHERE doc_id = ?`,
    docId,
  );
  return row?.n ?? 0;
}

export interface ChunkPreview {
  page_number: number;
  token_count: number;
  text: string;
}

/** A few chunk rows for the Dump-DB debug view. */
export async function previewChunks(docId: string, limit = 5): Promise<ChunkPreview[]> {
  const db = await getDb();
  return db.getAllAsync<ChunkPreview>(
    `SELECT page_number, token_count, substr(text, 1, 120) AS text
     FROM chunks WHERE doc_id = ? ORDER BY rowid LIMIT ?`,
    docId,
    limit,
  );
}
