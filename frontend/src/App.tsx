import { useCallback, useEffect, useState } from "react";
import { listDocuments, type DocumentOut } from "./api";
import AdminPanel from "./AdminPanel";
import DocumentSelector from "./DocumentSelector";
import QueryPanel from "./QueryPanel";

type View = "query" | "admin";

export default function App() {
  const [view, setView] = useState<View>("query");
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
      new Set(documents.filter((d) => d.status === "ready").map((d) => d.id)),
    );

  const selectNone = () => setSelected(new Set());

  return (
    <div className="flex min-h-screen flex-col bg-white text-slate-900">
      <header className="flex items-center gap-1 border-b border-slate-200 px-4 py-2">
        <span className="mr-3 text-sm font-semibold text-slate-700">
          PharmaGuide
        </span>
        <NavTab label="Query" active={view === "query"} onClick={() => setView("query")} />
        <NavTab label="Admin" active={view === "admin"} onClick={() => setView("admin")} />
      </header>

      {error && (
        <div className="m-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error} — is the backend running on :8000?
        </div>
      )}

      {view === "query" ? (
        <div className="flex flex-1">
          <DocumentSelector
            documents={documents}
            selected={selected}
            onToggle={toggle}
            onSelectAll={selectAll}
            onSelectNone={selectNone}
          />
          <QueryPanel selectedIds={[...selected]} />
        </div>
      ) : (
        <div className="flex flex-1">
          <AdminPanel documents={documents} onChanged={load} />
        </div>
      )}
    </div>
  );
}

function NavTab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded px-3 py-1 text-sm font-medium ${
        active
          ? "bg-slate-800 text-white"
          : "text-slate-600 hover:bg-slate-100"
      }`}
    >
      {label}
    </button>
  );
}
