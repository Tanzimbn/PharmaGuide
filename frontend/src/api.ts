// Typed client for the PharmaGuide backend. Types mirror backend/app/schemas.py.
// In dev, requests go to /api/* and Vite proxies them to the FastAPI server.

const BASE = "/api";

export interface DocumentOut {
  id: string;
  filename: string;
  category: string;
  status: string;
  page_count: number;
  uploaded_at: string;
  version: number;
}

export interface UploadResult {
  document: DocumentOut;
  // Non-blocking corpus soft-alert message (guardrails), if any.
  alert: string | null;
}

export interface Citation {
  doc_id: string;
  filename: string;
  page: number;
}

export interface AnswerOut {
  answer: string;
  citations: Citation[];
  not_covered: boolean;
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      if (body?.detail) detail = body.detail;
    } catch {
      // non-JSON error body; keep statusText
    }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

export async function listDocuments(): Promise<DocumentOut[]> {
  return handle<DocumentOut[]>(await fetch(`${BASE}/documents`));
}

// --- Admin: document management (FR-A1..A5). Multipart matches the FastAPI
// UploadFile + Form(...) signature in app/api/documents.py. ---

export async function uploadDocument(
  file: File,
  category: string,
): Promise<UploadResult> {
  const form = new FormData();
  form.append("file", file);
  form.append("category", category);
  return handle<UploadResult>(
    await fetch(`${BASE}/documents`, { method: "POST", body: form }),
  );
}

export async function replaceDocument(
  id: string,
  file: File,
  category?: string,
): Promise<UploadResult> {
  const form = new FormData();
  form.append("file", file);
  if (category) form.append("category", category);
  return handle<UploadResult>(
    await fetch(`${BASE}/documents/${id}`, { method: "PUT", body: form }),
  );
}

export async function deleteDocument(id: string): Promise<void> {
  const res = await fetch(`${BASE}/documents/${id}`, { method: "DELETE" });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      if (body?.detail) detail = body.detail;
    } catch {
      // non-JSON / empty 204 body
    }
    throw new Error(detail);
  }
}

export async function postQuery(
  question: string,
  docIds: string[] | null,
): Promise<AnswerOut> {
  const res = await fetch(`${BASE}/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, doc_ids: docIds }),
  });
  return handle<AnswerOut>(res);
}
