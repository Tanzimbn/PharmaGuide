// Library screen — manage personal PDFs (merges Track A P3+P4): add with a
// category, see live ingest status, atomic replace, delete. All data ops reuse
// the existing pipeline/lifecycle modules; this is presentation only.
import { useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";

import { DocumentListItem } from "../db";
import { deleteDocument, replaceDocument } from "../lifecycle";
import { PickedPdf, pickPdf } from "../pick";
import { ingestDocument } from "../pipeline";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorText,
  PdfTile,
  SectionHeader,
  StatusPill,
  TextField,
} from "../ui/components";
import { colors, font, spacing } from "../ui/theme";

const DEFAULT_CATEGORY = "Personal";

export default function LibraryScreen({
  docs,
  refresh,
}: {
  docs: DocumentListItem[];
  refresh: () => Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState<PickedPdf | null>(null);
  const [category, setCategory] = useState(DEFAULT_CATEGORY);

  const existingCategories = [...new Set(docs.map((d) => d.category))];

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setErr(null);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setErr(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(null);
    }
  }

  async function onPickForAdd() {
    setErr(null);
    const p = await pickPdf();
    if (!p) return;
    setPending(p);
    setCategory(existingCategories[0] ?? DEFAULT_CATEGORY);
  }

  function onConfirmAdd() {
    const p = pending;
    if (!p) return;
    const cat = category.trim() || DEFAULT_CATEGORY;
    run("add", async () => {
      await ingestDocument({ uri: p.uri, filename: p.name, category: cat, sizeBytes: p.size });
      setPending(null);
    });
  }

  function onReplace(doc: DocumentListItem) {
    run("replace", async () => {
      const p = await pickPdf();
      if (!p) return;
      await replaceDocument(doc.id, {
        uri: p.uri,
        filename: p.name,
        category: doc.category, // replace keeps the document's category
        sizeBytes: p.size,
      });
    });
  }

  function onDelete(doc: DocumentListItem) {
    Alert.alert("Delete document", `Remove "${doc.filename}" and all its chunks?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => run("delete", () => deleteDocument(doc.id).then(() => {})),
      },
    ]);
  }

  const grouped = groupByCategory(docs);

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      {pending ? (
        <Card style={styles.addPanel}>
          <View style={styles.addHead}>
            <PdfTile size={36} />
            <Text style={[font.bodyStrong, styles.addName]} numberOfLines={1}>
              {pending.name}
            </Text>
          </View>
          <TextField
            label="Category"
            value={category}
            onChangeText={setCategory}
            placeholder="e.g. GMP, Validation, SOP"
            autoFocus
          />
          {existingCategories.length > 0 && (
            <View style={styles.suggestRow}>
              {existingCategories.map((c) => (
                <Text key={c} style={styles.suggest} onPress={() => setCategory(c)}>
                  {c}
                </Text>
              ))}
            </View>
          )}
          <View style={styles.addActions}>
            <Button
              label="Cancel"
              variant="ghost"
              small
              onPress={() => setPending(null)}
              disabled={busy === "add"}
            />
            <Button
              label="Add"
              icon="plus"
              small
              onPress={onConfirmAdd}
              loading={busy === "add"}
            />
          </View>
        </Card>
      ) : (
        <Button label="Add PDF" icon="plus" variant="accent" onPress={onPickForAdd} disabled={!!busy} />
      )}

      {err && <ErrorText>{err}</ErrorText>}

      {docs.length === 0 && !busy && (
        <EmptyState
          icon="folder"
          title="No documents yet"
          hint="Tap Add PDF to ingest your first guideline."
        />
      )}

      {grouped.map(({ category: cat, items }) => (
        <View key={cat}>
          <SectionHeader label={cat} />
          {items.map((d) => (
            <Card key={d.id} style={styles.docCard}>
              <View style={styles.docHead}>
                <PdfTile />
                <View style={styles.docInfo}>
                  <Text style={styles.docName} numberOfLines={2}>
                    {d.filename}
                  </Text>
                  <Text style={styles.meta}>
                    {d.page_count} pages · {d.chunk_count} chunks · v{d.version}
                  </Text>
                </View>
                <StatusPill status={d.status} />
              </View>
              {d.status === "failed" && <Badge label="INGEST FAILED" />}
              <View style={styles.docActions}>
                <Button
                  label="Replace"
                  icon="refresh"
                  variant="secondary"
                  small
                  onPress={() => onReplace(d)}
                  disabled={!!busy}
                />
                <Button
                  label="Delete"
                  icon="trash"
                  variant="danger"
                  small
                  onPress={() => onDelete(d)}
                  disabled={!!busy}
                />
              </View>
            </Card>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

function groupByCategory(
  docs: DocumentListItem[],
): { category: string; items: DocumentListItem[] }[] {
  const order: string[] = [];
  const map = new Map<string, DocumentListItem[]>();
  for (const d of docs) {
    if (!map.has(d.category)) {
      map.set(d.category, []);
      order.push(d.category);
    }
    map.get(d.category)!.push(d);
  }
  return order.map((category) => ({ category, items: map.get(category)! }));
}

const styles = StyleSheet.create({
  page: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.sm },
  addPanel: { gap: spacing.md, borderColor: colors.primary },
  addHead: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  addName: { flex: 1, color: colors.text },
  suggestRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  suggest: {
    ...font.small,
    color: colors.primaryDown,
    backgroundColor: colors.primarySoft,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    borderRadius: 999,
    overflow: "hidden",
  },
  addActions: { flexDirection: "row", gap: spacing.sm, justifyContent: "flex-end" },
  docCard: { gap: spacing.sm, marginBottom: spacing.sm },
  docHead: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  docInfo: { flex: 1, gap: 2 },
  docName: { ...font.bodyStrong, color: colors.text },
  meta: { ...font.small, color: colors.sub, fontVariant: ["tabular-nums"] },
  docActions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs },
});
