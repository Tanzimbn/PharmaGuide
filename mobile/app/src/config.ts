// M1 ingestion constants — mirror backend/app/config.py so on-device chunking
// and guardrails match the web corpus exactly.

export const CHUNK_MAX_TOKENS = 512; // chunk_max_tokens
export const CHUNK_OVERLAP_TOKENS = 64; // chunk_overlap_tokens
export const MAX_FILE_MB = 50; // max_file_mb (hard reject)
export const MAX_PAGES_PER_FILE = 150; // max_pages_per_file (hard reject)

export const EMBED_BATCH_SIZE = 16; // bound memory/thermals on bulk embed (§10)

// --- Query path (M2) ---

export const QUERY_TOP_K = 5; // chunks sent to the LLM. No reranker in M2, so
// the kNN top-k IS the final set (mirrors web rerank_top_n=5).

// Score guard (FR-Q7): refuse before any LLM call if the best chunk is below
// this. NOTE: this is COSINE SIMILARITY (0..1, L2-normalized vectors), NOT the
// web's sigmoid rerank score — different distribution, so a different number.
// M2 drops the reranker, so the guard runs on retrieval cosine. Placeholder;
// calibrate against a gold set in M5 (mobile.md §13 M5).
export const SCORE_THRESHOLD = 0.3;

export const LLM_MAX_TOKENS = 1024;
export const LLM_TIMEOUT_MS = 30000;

// --- Runtime-setting seeds (M4) ---
//
// As of M4 the key, endpoints, and model are RUNTIME settings stored in device
// secure storage and edited in the Settings tab (see settings.ts). The consts
// below are only the FIRST-RUN SEED — what a fresh install starts with before
// the user saves anything. The `EXPO_PUBLIC_*` reads let the dev workbench seed
// real values from a gitignored .env; production installs start from the bare
// defaults. No API key default — the key is BYO, never bundled (mobile.md §8).
//
// NFR-2: extraction is a PER-USER endpoint (BYO), never a shared service every
// user's PDFs transit. Default blank so the user sets their own.
export const DEFAULT_EXTRACT_BASE_URL = process.env.EXPO_PUBLIC_EXTRACT_BASE_URL ?? "";
export const DEFAULT_LLM_BASE_URL =
  process.env.EXPO_PUBLIC_LLM_BASE_URL ?? "https://api.groq.com/openai/v1";
export const DEFAULT_LLM_MODEL =
  process.env.EXPO_PUBLIC_LLM_MODEL ?? "llama-3.3-70b-versatile";
export const DEFAULT_LLM_API_KEY = process.env.EXPO_PUBLIC_LLM_API_KEY ?? ""; // dev seed only
