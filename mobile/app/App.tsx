// App shell (M3) — the real PharmaGuide mobile app. Holds shared document state
// and a custom bottom tab bar (Library / Ask). No nav library: two screens are
// switched in JS, so no new native modules and the installed dev-client APK
// keeps working without a rebuild.
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
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
import { ErrorText } from "./src/ui/components";
import { colors, font, shadow, spacing } from "./src/ui/theme";

type Tab = "library" | "ask";

const ANDROID_TOP = Platform.OS === "android" ? (RNStatusBar.currentHeight ?? 0) : 0;

export default function App() {
  const [tab, setTab] = useState<Tab>("library");
  const { docs, loading, error, refresh } = useDocuments();

  return (
    <SafeAreaView style={[styles.root, { paddingTop: ANDROID_TOP }]}>
      <StatusBar style="dark" />

      <View style={styles.body}>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : error ? (
          <View style={styles.center}>
            <ErrorText>{error}</ErrorText>
          </View>
        ) : tab === "library" ? (
          <LibraryScreen docs={docs} refresh={refresh} />
        ) : (
          <AskScreen docs={docs} />
        )}
      </View>

      <View style={styles.tabBar}>
        <TabButton
          glyph="📚"
          label="Library"
          active={tab === "library"}
          onPress={() => setTab("library")}
        />
        <TabButton
          glyph="💬"
          label="Ask"
          active={tab === "ask"}
          onPress={() => setTab("ask")}
        />
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
