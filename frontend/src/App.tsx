import { useCallback, useEffect, useState } from "react";
import { listDocuments, type DocumentOut } from "./api";
import DocumentSelector from "./DocumentSelector";
import QueryPanel from "./QueryPanel";

export default function App() {
  const [documents, setDocuments] = useState<DocumentOut[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const docs = await listDocuments();
      setDocuments(docs);
      // Default scope = all ready documents (FR-Q2 default include).
      setSelected(
        new Set(docs.filter((d) => d.status === "ready").map((d) => d.id)),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load documents.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const selectAll = () =>
    setSelected(
      new Set(
        documents.filter((d) => d.status === "ready").map((d) => d.id),
      ),
    );

  const selectNone = () => setSelected(new Set());

  return (
    <div className="flex min-h-screen bg-white text-slate-900">
      <DocumentSelector
        documents={documents}
        selected={selected}
        onToggle={toggle}
        onSelectAll={selectAll}
        onSelectNone={selectNone}
      />
      <div className="flex-1">
        {error && (
          <div className="m-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error} — is the backend running on :8000?
          </div>
        )}
        <QueryPanel selectedIds={[...selected]} />
      </div>
    </div>
  );
}
