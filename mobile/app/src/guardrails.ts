// Upload guardrails — port of backend/app/ingestion/guardrails.py hard checks.
// Hard reject: file > MAX_FILE_MB or pages > MAX_PAGES_PER_FILE. (The soft
// corpus-size alert is web-only; not relevant to a personal corpus.)
import { MAX_FILE_MB, MAX_PAGES_PER_FILE } from "./config";

export class GuardrailError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GuardrailError";
  }
}

export function checkFileSize(sizeBytes: number): void {
  const limit = MAX_FILE_MB * 1024 * 1024;
  if (sizeBytes > limit) {
    const mb = sizeBytes / (1024 * 1024);
    throw new GuardrailError(`File is ${mb.toFixed(1)} MB; limit is ${MAX_FILE_MB} MB.`);
  }
}

export function checkPageCount(numPages: number): void {
  if (numPages > MAX_PAGES_PER_FILE) {
    throw new GuardrailError(
      `PDF has ${numPages} pages; limit is ${MAX_PAGES_PER_FILE} pages per file.`,
    );
  }
}
