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
export const EXTRACT_BASE_URL = "http://192.168.84.63:8001";
