// App shell — holds shared document state and a custom bottom tab bar (Library /
// Ask / Settings). No nav library: screens are switched in JS. A fixed teal
// ScreenHeader sits above the active screen; settings load in the startup gate so
// getSettings() is safe before first render.
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useDocuments } from "./src/hooks/useDocuments";
import AskScreen from "./src/screens/AskScreen";
import LibraryScreen from "./src/screens/LibraryScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import { loadSettings } from "./src/settings";
import { ErrorText, ScreenHeader } from "./src/ui/components";
import { Icon, IconName } from "./src/ui/icons";
import Splash from "./src/ui/Splash";
import { colors, font, shadow, spacing } from "./src/ui/theme";

type Tab = "library" | "ask" | "settings";

const HEADERS: Record<Tab, { title: string; subtitle: string }> = {
  library: { title: "Library", subtitle: "Your on-device guideline corpus." },
  ask: { title: "Ask", subtitle: "Grounded answers from your guidelines." },
  settings: { title: "Settings", subtitle: "Keys & endpoints stay on this device." },
};

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

  // Minimum splash dwell so it reads as a splash rather than flashing past.
  const [minSplash, setMinSplash] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setMinSplash(false), 1100);
    return () => clearTimeout(t);
  }, []);

  const booting = loading || !settingsReady;
  const bootErr = error ?? settingsErr;
  const h = HEADERS[tab];

  if (!bootErr && (booting || minSplash)) return <Splash />;

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <ScreenHeader title={h.title} subtitle={h.subtitle} />

      <View style={styles.body}>
        {bootErr ? (
          <View style={styles.center}>
            <ErrorText>{bootErr}</ErrorText>
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
        <TabButton icon="library" label="Library" active={tab === "library"} onPress={() => setTab("library")} />
        <TabButton icon="ask" label="Ask" active={tab === "ask"} onPress={() => setTab("ask")} />
        <TabButton icon="settings" label="Settings" active={tab === "settings"} onPress={() => setTab("settings")} />
      </View>
    </View>
  );
}

function TabButton({
  icon,
  label,
  active,
  onPress,
}: {
  icon: IconName;
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const tint = active ? colors.primary : colors.faint;
  return (
    <Pressable style={styles.tab} onPress={onPress}>
      <View style={[styles.tabIndicator, active && styles.tabIndicatorOn]} />
      <Icon name={icon} size={22} color={tint} strokeWidth={active ? 2.2 : 1.9} />
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
    paddingBottom: spacing.lg,
    ...shadow,
  },
  tab: { flex: 1, alignItems: "center", gap: 3 },
  tabIndicator: { width: 18, height: 3, borderRadius: 999, backgroundColor: "transparent" },
  tabIndicatorOn: { backgroundColor: colors.accent },
  tabLabel: { ...font.tiny },
});
