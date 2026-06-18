// Ask screen — grounded query over ready documents. Renders answerQuestion()'s
// result; the groundedness contract (score guard, page citations, "not covered"
// fallback) is enforced in answer.ts, not here.
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { answerQuestion } from "../answer";
import { DocumentListItem } from "../db";
import {
  Badge,
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorText,
  PdfTile,
  TextField,
} from "../ui/components";
import { AnswerOut } from "../types";
import { colors, font, spacing } from "../ui/theme";

export default function AskScreen({ docs }: { docs: DocumentListItem[] }) {
  const [question, setQuestion] = useState("");
  const [scope, setScope] = useState<Set<string>>(new Set()); // empty => all ready
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ans, setAns] = useState<AnswerOut | null>(null);

  const readyDocs = docs.filter((d) => d.status === "ready");

  function toggleScope(id: string) {
    setScope((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function onAsk() {
    const q = question.trim();
    if (!q) return;
    setBusy(true);
    setErr(null);
    setAns(null);
    const docIds = scope.size ? [...scope] : undefined; // undefined => all ready
    answerQuestion(q, { docIds })
      .then(setAns)
      .catch((e) => setErr(String(e instanceof Error ? e.message : e)))
      .finally(() => setBusy(false));
  }

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      {readyDocs.length === 0 ? (
        <EmptyState
          icon="ask"
          title="No ready documents"
          hint="Add and ingest a PDF in the Library tab first."
        />
      ) : (
        <>
          <TextField
            value={question}
            onChangeText={setQuestion}
            placeholder="Ask a question about the selected guidelines…"
            multiline
            editable={!busy}
          />

          <Text style={styles.scopeLabel}>Scope · none selected = all ready</Text>
          <View style={styles.chips}>
            {readyDocs.map((d) => (
              <Chip
                key={d.id}
                label={d.filename}
                active={scope.has(d.id)}
                onPress={() => toggleScope(d.id)}
              />
            ))}
          </View>

          <Button label="Ask" icon="send" onPress={onAsk} loading={busy} disabled={!question.trim()} />
        </>
      )}

      {err && <ErrorText>{err}</ErrorText>}

      {ans && (
        <Card tone={ans.not_covered ? "warn" : "default"} style={styles.answerCard}>
          <View style={styles.answerHead}>
            {ans.not_covered ? (
              <Badge label="NOT COVERED" tone="warn" />
            ) : (
              <View style={styles.answerEyebrow}>
                <View style={styles.answerDot} />
                <Text style={styles.answerLabel}>ANSWER</Text>
              </View>
            )}
            {ans.citations.length > 0 && (
              <Text style={styles.sourceCount}>
                {ans.citations.length} source{ans.citations.length > 1 ? "s" : ""}
              </Text>
            )}
          </View>

          <Text style={styles.answer}>{ans.answer}</Text>

          {ans.citations.length > 0 && (
            <>
              <View style={styles.divider} />
              <Text style={styles.sourcesLabel}>SOURCES</Text>
              {ans.citations.map((c, i) => (
                <View key={i} style={styles.source}>
                  <PdfTile size={36} />
                  <View style={styles.sourceInfo}>
                    <Text style={styles.sourceName} numberOfLines={1}>
                      {c.filename}
                    </Text>
                    <Text style={styles.pagePill}>page {c.page}</Text>
                  </View>
                </View>
              ))}
            </>
          )}

          <Button
            label="New question"
            variant="secondary"
            onPress={() => {
              setQuestion("");
              setAns(null);
            }}
            style={styles.newQ}
          />
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  scopeLabel: { ...font.small, color: colors.faint, marginTop: spacing.xs },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },

  answerCard: { gap: spacing.sm, marginTop: spacing.sm },
  answerHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  answerEyebrow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  answerDot: { width: 8, height: 8, borderRadius: 999, backgroundColor: colors.success },
  answerLabel: { ...font.label, color: colors.success, textTransform: "uppercase" },
  sourceCount: { ...font.small, color: colors.faint },
  answer: { ...font.body, color: colors.text, lineHeight: 23 },

  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.xs },
  sourcesLabel: { ...font.label, color: colors.faint, textTransform: "uppercase" },
  source: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  sourceInfo: { flex: 1, gap: 3 },
  sourceName: { ...font.bodyStrong, color: colors.text },
  pagePill: {
    ...font.tiny,
    color: colors.primaryDown,
    backgroundColor: colors.primarySoft,
    alignSelf: "flex-start",
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
    borderRadius: 999,
    overflow: "hidden",
    fontVariant: ["tabular-nums"],
  },
  newQ: { marginTop: spacing.sm },
});
