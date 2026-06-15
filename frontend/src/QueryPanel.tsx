import { useState } from "react";
import { postQuery, type AnswerOut } from "./api";

interface Props {
  // Currently selected (ready) document ids. Empty => nothing in scope.
  selectedIds: string[];
}

// Question box + cited-answer view. Sends the selected document scope with the
// query (FR-Q4) and renders the grounded answer, page citations (FR-Q6), or the
// "not covered" state (FR-Q7).
export default function QueryPanel({ selectedIds }: Props) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<AnswerOut | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canAsk = question.trim().length > 0 && selectedIds.length > 0 && !loading;

  async function ask() {
    if (!canAsk) return;
    setLoading(true);
    setError(null);
    setAnswer(null);
    try {
      const result = await postQuery(question.trim(), selectedIds);
      setAnswer(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Query failed.");
    } finally {
      setLoading(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    // Cmd/Ctrl+Enter submits.
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") ask();
  }

  return (
    <main className="flex-1 p-8">
      <h1 className="mb-1 text-xl font-semibold text-slate-800">PharmaGuide</h1>
      <p className="mb-6 text-sm text-slate-500">
        Ask a question; answers come only from the selected guidelines, with page
        citations.
      </p>

      <textarea
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        onKeyDown={onKeyDown}
        rows={3}
        placeholder="e.g. What is the maintenance interval for pump X?"
        className="w-full resize-y rounded-lg border border-slate-300 p-3 text-sm focus:border-slate-500 focus:outline-none"
      />

      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={ask}
          disabled={!canAsk}
          className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {loading ? "Asking…" : "Ask"}
        </button>
        {selectedIds.length === 0 && (
          <span className="text-xs text-amber-600">
            Select at least one guideline to ask.
          </span>
        )}
      </div>

      {error && (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {answer && <AnswerView answer={answer} />}
    </main>
  );
}

function AnswerView({ answer }: { answer: AnswerOut }) {
  if (answer.not_covered) {
    return (
      <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        {answer.answer}
      </div>
    );
  }
  return (
    <div className="mt-6 rounded-lg border border-slate-200 bg-white p-5">
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
        {answer.answer}
      </p>
      {answer.citations.length > 0 && (
        <div className="mt-4 border-t border-slate-100 pt-3">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Sources
          </h3>
          <ul className="flex flex-wrap gap-2">
            {answer.citations.map((c, i) => (
              <li
                key={`${c.doc_id}-${c.page}-${i}`}
                className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600"
              >
                {c.filename} · p.{c.page}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
