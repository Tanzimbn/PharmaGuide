import { useEffect, useMemo, useRef, useState } from "react";
import {
  deleteDocument,
  replaceDocument,
  uploadDocument,
  type DocumentOut,
} from "./api";

interface Props {
  documents: DocumentOut[];
  // Reload the shared document list after a mutation (upload/replace/delete).
  onChanged: () => Promise<void> | void;
}

// Non-technical admin console (FR-A1..A6): upload + categorize, view the live
// document list with ingestion status (FR-A4/A5), and replace (FR-A3) or
// delete (FR-A2) documents. All work goes through the existing /documents API.
export default function AdminPanel({ documents, onChanged }: Props) {
  // Suggest categories the corpus already uses (FR-A1 examples: Safety,
  // Maintenance, Quality), while still allowing a new free-text category.
  const knownCategories = useMemo(
    () => [...new Set(documents.map((d) => d.category))].sort(),
    [documents],
  );

  // Poll while anything is still processing so status flips to ready/failed
  // without a manual refresh (FR-A4).
  const anyProcessing = documents.some((d) => d.status === "processing");
  useEffect(() => {
    if (!anyProcessing) return;
    const id = setInterval(() => void onChanged(), 2000);
    return () => clearInterval(id);
  }, [anyProcessing, onChanged]);

  return (
    <main className="flex-1 p-8">
      <h1 className="mb-1 text-xl font-semibold text-slate-800">
        Manage guidelines
      </h1>
      <p className="mb-6 text-sm text-slate-500">
        Upload, categorize, replace, or remove guideline PDFs. Newly uploaded
        documents become queryable once their status reads <em>ready</em>.
      </p>

      <UploadForm categories={knownCategories} onChanged={onChanged} />
      <DocumentTable documents={documents} onChanged={onChanged} />
    </main>
  );
}

function UploadForm({
  categories,
  onChanged,
}: {
  categories: string[];
  onChanged: () => Promise<void> | void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alert, setAlert] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const canUpload = !!file && category.trim().length > 0 && !busy;

  async function submit() {
    if (!file || !canUpload) return;
    setBusy(true);
    setError(null);
    setAlert(null);
    try {
      const result = await uploadDocument(file, category.trim());
      setAlert(result.alert);
      setFile(null);
      if (fileInput.current) fileInput.current.value = "";
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mb-8 rounded-lg border border-slate-200 bg-slate-50 p-5">
      <h2 className="mb-3 text-sm font-semibold text-slate-700">
        Upload a new guideline
      </h2>
      <div className="flex flex-wrap items-end gap-4">
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-500">
            PDF file
          </span>
          <input
            ref={fileInput}
            type="file"
            accept="application/pdf,.pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block text-sm text-slate-600 file:mr-3 file:rounded file:border-0 file:bg-slate-200 file:px-3 file:py-1.5 file:text-slate-700 hover:file:bg-slate-300"
          />
        </label>

        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-500">
            Category
          </span>
          <input
            list="known-categories"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="e.g. Safety, Maintenance, Quality"
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
          />
          <datalist id="known-categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>

        <button
          onClick={submit}
          disabled={!canUpload}
          className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {busy ? "Uploading…" : "Upload"}
        </button>
      </div>

      {error && (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {alert && (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {alert}
        </p>
      )}
    </section>
  );
}

function DocumentTable({
  documents,
  onChanged,
}: {
  documents: DocumentOut[];
  onChanged: () => Promise<void> | void;
}) {
  if (documents.length === 0) {
    return (
      <p className="text-sm text-slate-400">No documents uploaded yet.</p>
    );
  }
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
          <tr>
            <th className="px-4 py-2 font-medium">Document</th>
            <th className="px-4 py-2 font-medium">Category</th>
            <th className="px-4 py-2 font-medium">Status</th>
            <th className="px-4 py-2 font-medium">Pages</th>
            <th className="px-4 py-2 font-medium">Ver.</th>
            <th className="px-4 py-2 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {documents.map((d) => (
            <DocumentRow key={d.id} doc={d} onChanged={onChanged} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DocumentRow({
  doc,
  onChanged,
}: {
  doc: DocumentOut;
  onChanged: () => Promise<void> | void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const replaceInput = useRef<HTMLInputElement>(null);

  async function onReplaceFile(file: File) {
    setBusy(true);
    setError(null);
    try {
      // Category preserved server-side when omitted (atomic replace, FR-A3).
      await replaceDocument(doc.id, file);
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Replace failed.");
    } finally {
      setBusy(false);
      if (replaceInput.current) replaceInput.current.value = "";
    }
  }

  async function onDelete() {
    if (!confirm(`Delete "${doc.filename}"? Its indexed content is purged.`)) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await deleteDocument(doc.id);
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed.");
      setBusy(false);
    }
  }

  return (
    <tr className="text-slate-700">
      <td className="px-4 py-2">{doc.filename}</td>
      <td className="px-4 py-2 text-slate-500">{doc.category}</td>
      <td className="px-4 py-2">
        <StatusBadge status={doc.status} />
        {error && <span className="ml-2 text-xs text-red-600">{error}</span>}
      </td>
      <td className="px-4 py-2 text-slate-500">{doc.page_count}</td>
      <td className="px-4 py-2 text-slate-500">v{doc.version}</td>
      <td className="px-4 py-2">
        <div className="flex justify-end gap-2">
          <input
            ref={replaceInput}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onReplaceFile(f);
            }}
          />
          <button
            onClick={() => replaceInput.current?.click()}
            disabled={busy}
            className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-50"
          >
            {busy ? "Working…" : "Replace"}
          </button>
          <button
            onClick={onDelete}
            disabled={busy}
            className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            Delete
          </button>
        </div>
      </td>
    </tr>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    ready: "bg-green-100 text-green-700",
    processing: "bg-amber-100 text-amber-700",
    failed: "bg-red-100 text-red-700",
  };
  const cls = styles[status] ?? "bg-slate-100 text-slate-600";
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}
    >
      {status}
    </span>
  );
}
