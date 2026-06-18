// Branded splash — shown over the teal canvas while documents + settings load
// (and for a short minimum so it reads as a splash, not a flash). Pure JS overlay
// so it needs no generated image asset; the native splash bg is also teal
// (app.json) to avoid a white flash before this mounts.
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { Logo } from "./icons";
import { colors, font, spacing } from "./theme";

export default function Splash() {
  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <View style={styles.center}>
        <Logo size={88} />
        <Text style={styles.word}>PharmaGuide</Text>
        <Text style={styles.tag}>On-device guideline answers</Text>
      </View>
      <ActivityIndicator color={colors.accent} style={styles.spin} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.header, alignItems: "center", justifyContent: "center" },
  center: { alignItems: "center", gap: spacing.md },
  word: { ...font.h1, fontSize: 32, color: colors.headerText, marginTop: spacing.sm },
  tag: { ...font.small, color: colors.headerSub },
  spin: { position: "absolute", bottom: spacing.xxl + spacing.lg },
});
