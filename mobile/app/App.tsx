// M1 dev harness — exercises the on-device ingestion pipeline (pick PDF ->
// extract -> chunk -> embed -> SQLite, with status lifecycle + atomic
// replace/delete). This is NOT the real docs UI (that's M3); it's the minimal
// surface to verify M1 against docs/mobile.md §5 + mobile-m0-spike gate parity.
import * as DocumentPicker from "expo-document-picker";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  ChunkPreview,
  DocumentListItem,
  listDocuments,
  previewChunks,
} from "./src/db";
import { deleteDocument, replaceDocument } from "./src/lifecycle";
import { ingestDocument } from "./src/pipeline";

interface Picked {
  uri: string;
  name: string;
  size: number;
}

async function pickPdf(): Promise<Picked | null> {
  const res = await DocumentPicker.getDocumentAsync({
    type: "application/pdf",
    copyToCacheDirectory: true,
  });
  if (res.canceled || !res.assets?.length) return null;
  const a = res.assets[0];
  return { uri: a.uri, name: a.name ?? "document.pdf", size: a.size ?? 0 };
}

export default function App() {
  const [busy, setBusy] = useState<string | null>(null);
  const [docs, setDocs] = useState<DocumentListItem[]>([]);
  const [log, setLog] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [dump, setDump] = useState<Record<string, ChunkPreview[]>>({});

  async function refresh() {
    setDocs(await listDocuments());
  }
  useEffect(() => {
    refresh().catch((e) => setErr(String(e)));
  }, []);

  async function guard(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setErr(null);
    setLog(null);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setErr(String(e instanceof Error ? (e.stack ?? e.message) : e));
    } finally {
      setBusy(null);
    }
  }

  function onIngest() {
    guard("ingest", async () => {
      const p = await pickPdf();
      if (!p) return;
      const t = Date.now();
      const r = await ingestDocument({
        uri: p.uri,
        filename: p.name,
        category: "personal",
        sizeBytes: p.size,
      });
      setLog(`Ingested "${p.name}": ${r.chunk_count} chunks, ${r.page_count} pages in ${Date.now() - t}ms`);
    });
  }

  function onReplace(oldId: string, name: string) {
    guard("replace", async () => {
      const p = await pickPdf();
      if (!p) return;
      const r = await replaceDocument(oldId, {
        uri: p.uri,
        filename: p.name,
        category: "personal",
        sizeBytes: p.size,
      });
      setLog(`Replaced "${name}" -> "${p.name}": ${r.chunk_count} chunks (v from new row)`);
    });
  }

  function onDelete(id: string, name: string) {
    guard("delete", async () => {
      await deleteDocument(id);
      setDump((d) => {
        const { [id]: _, ...rest } = d;
        return rest;
      });
      setLog(`Deleted "${name}"`);
    });
  }

  function onDump(id: string) {
    guard("dump", async () => {
      const rows = await previewChunks(id, 5);
      setDump((d) => ({ ...d, [id]: rows }));
    });
  }

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <StatusBar style="auto" />
      <Text style={styles.h1}>PharmaGuide — M1 ingestion</Text>
      <Text style={styles.sub}>Pick a (non-confidential) PDF to ingest on-device.</Text>

      <Btn label="Pick PDF & ingest" disabled={!!busy} onPress={onIngest} />

      {busy && (
        <View style={styles.busy}>
          <ActivityIndicator />
          <Text style={styles.row}> {busy}…</Text>
        </View>
      )}
      {log && <Text style={styles.ok}>{log}</Text>}
      {err && <Text style={styles.err}>{err}</Text>}

      {docs.length === 0 && !busy && <Text style={styles.note}>No documents yet.</Text>}

      {docs.map((d) => (
        <View key={d.id} style={styles.card}>
          <Text style={styles.cardTitle}>{d.filename}</Text>
          <Text style={styles.row}>
            {statusIcon(d.status)} {d.status} · {d.page_count} pages · {d.chunk_count} chunks · v{d.version}
          </Text>
          <View style={styles.actions}>
            <Btn small label="Replace" disabled={!!busy} onPress={() => onReplace(d.id, d.filename)} />
            <Btn small label="Delete" disabled={!!busy} onPress={() => onDelete(d.id, d.filename)} />
            <Btn small label="Dump DB" disabled={!!busy} onPress={() => onDump(d.id)} />
          </View>
          {dump[d.id]?.map((c, i) => (
            <Text key={i} style={styles.dump}>
              p{c.page_number} · {c.token_count}tok · {c.text.replace(/\n/g, " ")}
            </Text>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

function statusIcon(s: string): string {
  return s === "ready" ? "✅" : s === "failed" ? "❌" : "⏳";
}

function Btn({
  label,
  onPress,
  disabled,
  small,
}: {
  label: string;
  onPress: () => void;
  disabled: boolean;
  small?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btn,
        small && styles.btnSmall,
        disabled && styles.btnOff,
        pressed && styles.btnDown,
      ]}
    >
      <Text style={styles.btnText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { padding: 20, paddingTop: 64, gap: 10 },
  h1: { fontSize: 22, fontWeight: "700" },
  sub: { color: "#555", marginBottom: 8 },
  busy: { flexDirection: "row", alignItems: "center", marginVertical: 8 },
  btn: { backgroundColor: "#1f6feb", padding: 14, borderRadius: 10, alignItems: "center" },
  btnSmall: { paddingVertical: 8, paddingHorizontal: 12, flex: 1 },
  btnDown: { opacity: 0.7 },
  btnOff: { backgroundColor: "#9bb7e3" },
  btnText: { color: "white", fontWeight: "600" },
  card: { borderWidth: 1, borderColor: "#ddd", borderRadius: 10, padding: 12, marginTop: 8 },
  cardTitle: { fontWeight: "700", marginBottom: 6 },
  actions: { flexDirection: "row", gap: 8, marginTop: 8 },
  row: { fontSize: 15, paddingVertical: 2, fontVariant: ["tabular-nums"] },
  dump: { fontSize: 11, color: "#444", fontFamily: "Courier", marginTop: 4 },
  ok: { color: "#0a7d24", fontSize: 13 },
  note: { color: "#777", fontSize: 12, marginTop: 16 },
  err: { color: "#b00020", fontFamily: "Courier", fontSize: 12 },
});
