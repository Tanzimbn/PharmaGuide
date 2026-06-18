// M1 ingestion constants — mirror backend/app/config.py so on-device chunking
// and guardrails match the web corpus exactly.

export const CHUNK_MAX_TOKENS = 512; // chunk_max_tokens
export const CHUNK_OVERLAP_TOKENS = 64; // chunk_overlap_tokens
export const MAX_FILE_MB = 50; // max_file_mb (hard reject)
export const MAX_PAGES_PER_FILE = 150; // max_pages_per_file (hard reject)

export const EMBED_BATCH_SIZE = 16; // bound memory/thermals on bulk embed (§10)

// Extraction service base URL (mobile.md §6 Option B). In dev this is your
// laptop's LAN IP, NOT localhost — the phone reaches it over wifi. Find it with
// `ipconfig getifaddr en0` (macOS). See mobile/extract-service/README.md.
export const EXTRACT_BASE_URL = "http://192.168.84.90:8001";

// --- Query path (M2) ---

export const QUERY_TOP_K = 5; // chunks sent to the LLM. No reranker in M2, so
// the kNN top-k IS the final set (mirrors web rerank_top_n=5).

// Score guard (FR-Q7): refuse before any LLM call if the best chunk is below
// this. NOTE: this is COSINE SIMILARITY (0..1, L2-normalized vectors), NOT the
// web's sigmoid rerank score — different distribution, so a different number.
// M2 drops the reranker, so the guard runs on retrieval cosine. Placeholder;
// calibrate against a gold set in M5 (mobile.md §13 M5).
export const SCORE_THRESHOLD = 0.3;

// LLM generation endpoint (OpenAI-compatible /chat/completions). The single swap
// point (arch §7): point these at any hosted trial endpoint (Groq/OpenRouter/
// Together) or local Ollama. DEV CONFIG ONLY — M4 moves the key into secure
// storage (Keychain/Keystore) with a BYO-key entry screen.
//
// NFR-2 (data residency): retrieved chunks leave the device to a hosted LLM, so
// use NON-CONFIDENTIAL sample PDFs only until generation moves in-VPC/on-device.
//
// The API key is read from a GITIGNORED .env (EXPO_PUBLIC_* is inlined at build
// time) so a real key never lands in git — this repo is public. Copy
// .env.example to .env and paste your trial key there. base_url/model can be
// overridden the same way; they fall back to the public Groq trial defaults.
export const LLM_BASE_URL =
  process.env.EXPO_PUBLIC_LLM_BASE_URL ?? "https://api.groq.com/openai/v1";
export const LLM_MODEL = process.env.EXPO_PUBLIC_LLM_MODEL ?? "llama-3.3-70b-versatile";
export const LLM_API_KEY = process.env.EXPO_PUBLIC_LLM_API_KEY ?? ""; // from .env, never committed
export const LLM_MAX_TOKENS = 1024;
export const LLM_TIMEOUT_MS = 30000;
