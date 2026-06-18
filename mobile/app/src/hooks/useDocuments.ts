// Shared document-list state. Lifted to App and passed to both screens so the
// Ask screen always sees the Library's latest add/replace/delete.
import { useCallback, useEffect, useState } from "react";

import { DocumentListItem, listDocuments } from "../db";

export interface UseDocuments {
  docs: DocumentListItem[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useDocuments(): UseDocuments {
  const [docs, setDocs] = useState<DocumentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      setDocs(await listDocuments());
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { docs, loading, error, refresh };
}
