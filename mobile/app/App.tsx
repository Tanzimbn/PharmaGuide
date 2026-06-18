// App shell — the real PharmaGuide mobile app. Holds shared document state and a
// custom bottom tab bar (Library / Ask / Settings). No nav library: screens are
// switched in JS. M4 loads runtime settings (BYO key + endpoints from secure
// storage) in the startup gate before any screen or query reads them.
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  SafeAreaView,
  StatusBar as RNStatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useDocuments } from "./src/hooks/useDocuments";
import AskScreen from "./src/screens/AskScreen";
import LibraryScreen from "./src/screens/LibraryScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import { loadSettings } from "./src/settings";
import { ErrorText } from "./src/ui/components";
import { colors, font, shadow, spacing } from "./src/ui/theme";

type Tab = "library" | "ask" | "settings";

const ANDROID_TOP = Platform.OS === "android" ? (RNStatusBar.currentHeight ?? 0) : 0;

export default function App() {
  const [tab, setTab] = useState<Tab>("library");
  const { docs, loading, error, refresh } = useDocuments();

  // Load runtime settings once before first render so getSettings() is safe.
  const [settingsReady, setSettingsReady] = useState(false);
  const [settingsErr, setSettingsErr] = useState<string | null>(null);
  useEffect(() => {
    loadSettings()
      .then(() => setSettingsReady(true))
      .catch((e) => setSettingsErr(String(e instanceof Error ? e.message : e)));
  }, []);

  const booting = loading || !settingsReady;
  const bootErr = error ?? settingsErr;

  return (
    <SafeAreaView style={[styles.root, { paddingTop: ANDROID_TOP }]}>
      <StatusBar style="dark" />

      <View style={styles.body}>
        {bootErr ? (
          <View style={styles.center}>
            <ErrorText>{bootErr}</ErrorText>
          </View>
        ) : booting ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : tab === "library" ? (
          <LibraryScreen docs={docs} refresh={refresh} />
        ) : tab === "ask" ? (
          <AskScreen docs={docs} />
        ) : (
          <SettingsScreen />
        )}
      </View>

      <View style={styles.tabBar}>
        <TabButton glyph="📚" label="Library" active={tab === "library"} onPress={() => setTab("library")} />
        <TabButton glyph="💬" label="Ask" active={tab === "ask"} onPress={() => setTab("ask")} />
        <TabButton glyph="⚙️" label="Settings" active={tab === "settings"} onPress={() => setTab("settings")} />
      </View>
    </SafeAreaView>
  );
}

function TabButton({
  glyph,
  label,
  active,
  onPress,
}: {
  glyph: string;
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const tint = active ? colors.primary : colors.faint;
  return (
    <Pressable style={[styles.tab, !active && styles.tabDim]} onPress={onPress}>
      <Text style={styles.tabGlyph}>{glyph}</Text>
      <Text style={[styles.tabLabel, { color: tint }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg },
  tabBar: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    ...shadow,
  },
  tab: { flex: 1, alignItems: "center", gap: 2 },
  tabDim: { opacity: 0.6 },
  tabGlyph: { fontSize: 20 },
  tabLabel: { ...font.tiny, fontWeight: "600" },
});
