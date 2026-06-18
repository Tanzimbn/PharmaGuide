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
      <Text style={styles.title}>Ask</Text>
      <Text style={styles.sub}>Answers come only from your selected guidelines.</Text>

      {readyDocs.length === 0 ? (
        <EmptyState
          icon="💬"
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

          <Button label="Ask" icon="➤" onPress={onAsk} loading={busy} disabled={!question.trim()} />
        </>
      )}

      {err && <ErrorText>{err}</ErrorText>}

      {ans && (
        <Card tone={ans.not_covered ? "warn" : "default"} style={styles.answerCard}>
          {ans.not_covered && <Badge label="NOT COVERED" />}
          <Text style={styles.answer}>{ans.answer}</Text>
          {ans.citations.length > 0 && (
            <View style={styles.cites}>
              {ans.citations.map((c, i) => (
                <Text key={i} style={styles.cite}>
                  • {c.filename} · p.{c.page}
                </Text>
              ))}
            </View>
          )}
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  title: { ...font.h1, color: colors.text },
  sub: { ...font.small, color: colors.sub, marginBottom: spacing.xs },
  scopeLabel: { ...font.small, color: colors.faint, marginTop: spacing.xs },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  answerCard: { gap: spacing.sm, marginTop: spacing.sm },
  answer: { ...font.body, color: colors.text, lineHeight: 22 },
  cites: { gap: spacing.xs, marginTop: spacing.xs },
  cite: { ...font.small, color: colors.primary, fontVariant: ["tabular-nums"] },
});
