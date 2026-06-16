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
