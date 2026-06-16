import { useMemo } from "react";
import type { DocumentOut } from "./api";

interface Props {
  documents: DocumentOut[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
}

// Lists current guideline PDFs grouped by category with include/exclude
// toggles (FR-Q2). Only `ready` documents are selectable — others are shown
// disabled with their status so the user understands why they can't be queried.
export default function DocumentSelector({
  documents,
  selected,
  onToggle,
  onSelectAll,
  onSelectNone,
}: Props) {
  const groups = useMemo(() => {
    const byCat = new Map<string, DocumentOut[]>();
    for (const d of documents) {
      const list = byCat.get(d.category) ?? [];
      list.push(d);
      byCat.set(d.category, list);
    }
    return [...byCat.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [documents]);

  const readyCount = documents.filter((d) => d.status === "ready").length;

  return (
    <aside className="w-72 shrink-0 border-r border-slate-200 bg-slate-50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">
          Guidelines in scope
        </h2>
        <span className="text-xs text-slate-400">
          {selected.size}/{readyCount}
        </span>
      </div>

      <div className="mb-4 flex gap-2 text-xs">
        <button
          onClick={onSelectAll}
          className="rounded border border-slate-300 px-2 py-1 text-slate-600 hover:bg-slate-100"
        >
          Select all
        </button>
        <button
          onClick={onSelectNone}
          className="rounded border border-slate-300 px-2 py-1 text-slate-600 hover:bg-slate-100"
        >
          Clear
        </button>
      </div>

      {documents.length === 0 && (
        <p className="text-sm text-slate-400">No documents uploaded yet.</p>
      )}

      <div className="space-y-4">
        {groups.map(([category, docs]) => (
          <div key={category}>
            <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">
              {category}
            </h3>
            <ul className="space-y-1">
              {docs.map((d) => {
                const ready = d.status === "ready";
                return (
                  <li key={d.id}>
                    <label
                      className={`flex items-start gap-2 rounded px-2 py-1 text-sm ${
                        ready
                          ? "cursor-pointer text-slate-700 hover:bg-slate-100"
                          : "cursor-not-allowed text-slate-400"
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        disabled={!ready}
                        checked={selected.has(d.id)}
                        onChange={() => onToggle(d.id)}
                      />
                      <span className="flex-1">
                        {d.filename}
                        {!ready && (
                          <span className="ml-1 text-xs italic">({d.status})</span>
                        )}
                        <span className="block text-xs text-slate-400">
                          {d.page_count} pp · v{d.version}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </aside>
  );
}
