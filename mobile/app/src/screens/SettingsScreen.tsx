// Settings screen (M4) — BYO LLM key + endpoints. The key is stored in device
// secure storage (Keychain/Keystore); see settings.ts. The key field shows
// set-state, never the stored value. Saving takes effect immediately (llm.ts /
// extractClient.ts read the cache at call time).
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { clearKey, getSettings, saveSettings } from "../settings";
import { Button, Card, ErrorText, SectionHeader, TextField } from "../ui/components";
import { colors, font, spacing } from "../ui/theme";

export default function SettingsScreen() {
  const initial = getSettings();
  // Key field starts empty: we never surface the stored secret. A separate flag
  // tracks whether a key is currently saved.
  const [keyInput, setKeyInput] = useState("");
  const [hasKey, setHasKey] = useState(!!initial.llmApiKey);
  const [baseUrl, setBaseUrl] = useState(initial.llmBaseUrl);
  const [model, setModel] = useState(initial.llmModel);
  const [extractUrl, setExtractUrl] = useState(initial.extractBaseUrl);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function onSave() {
    setBusy(true);
    setErr(null);
    setSaved(false);
    const patch: Parameters<typeof saveSettings>[0] = {
      llmBaseUrl: baseUrl.trim(),
      llmModel: model.trim(),
      extractBaseUrl: extractUrl.trim(),
    };
    if (keyInput.trim()) patch.llmApiKey = keyInput.trim(); // only overwrite when typed
    saveSettings(patch)
      .then(() => {
        if (keyInput.trim()) setHasKey(true);
        setKeyInput("");
        setSaved(true);
      })
      .catch((e) => setErr(String(e instanceof Error ? e.message : e)))
      .finally(() => setBusy(false));
  }

  function onClearKey() {
    setBusy(true);
    setErr(null);
    setSaved(false);
    clearKey()
      .then(() => {
        setHasKey(false);
        setKeyInput("");
      })
      .catch((e) => setErr(String(e instanceof Error ? e.message : e)))
      .finally(() => setBusy(false));
  }

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Settings</Text>
      <Text style={styles.sub}>
        Your key and endpoints stay on this device (secure storage). Use a
        non-confidential corpus — chunks go to your chosen LLM (NFR-2).
      </Text>

      <SectionHeader label="LLM access (bring your own key)" />
      <Card style={styles.card}>
        <View style={styles.keyState}>
          <Text style={font.bodyStrong}>API key</Text>
          <Text style={[styles.keyBadge, hasKey ? styles.keyOn : styles.keyOff]}>
            {hasKey ? "✓ set" : "not set"}
          </Text>
        </View>
        <TextField
          value={keyInput}
          onChangeText={setKeyInput}
          placeholder={hasKey ? "Enter a new key to replace…" : "Paste your API key"}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
        />
        {hasKey && (
          <Button label="Clear key" variant="danger" small onPress={onClearKey} disabled={busy} />
        )}
        <TextField
          label="Base URL (OpenAI-compatible)"
          value={baseUrl}
          onChangeText={setBaseUrl}
          placeholder="https://api.groq.com/openai/v1"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TextField
          label="Model"
          value={model}
          onChangeText={setModel}
          placeholder="llama-3.3-70b-versatile"
          autoCapitalize="none"
          autoCorrect={false}
        />
      </Card>

      <SectionHeader label="Extraction service" />
      <Card style={styles.card}>
        <TextField
          label="Extract service URL (your own — not shared)"
          value={extractUrl}
          onChangeText={setExtractUrl}
          placeholder="http://192.168.x.x:8001"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Text style={styles.hint}>
          PDFs transit this service during ingest. Point it at your own endpoint
          (laptop LAN IP in dev), never a shared host (NFR-2).
        </Text>
      </Card>

      {err && <ErrorText>{err}</ErrorText>}
      {saved && <Text style={styles.savedNote}>Saved.</Text>}

      <Button label="Save settings" icon="💾" onPress={onSave} loading={busy} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.sm },
  title: { ...font.h1, color: colors.text },
  sub: { ...font.small, color: colors.sub, marginBottom: spacing.sm },
  card: { gap: spacing.md },
  keyState: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  keyBadge: { ...font.tiny, paddingVertical: 3, paddingHorizontal: spacing.sm, borderRadius: 999, overflow: "hidden" },
  keyOn: { color: colors.success, backgroundColor: colors.successSoft },
  keyOff: { color: colors.faint, backgroundColor: colors.bg },
  hint: { ...font.small, color: colors.faint },
  savedNote: { ...font.small, color: colors.success, textAlign: "center" },
});
