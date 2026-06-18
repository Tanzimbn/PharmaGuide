// Reusable UI kit for the M3 app, styled from theme tokens. Pure RN only — icons
// are Unicode/emoji glyphs (no @expo/vector-icons, which pulls the native
// expo-font module and would force a dev-client rebuild). No business logic
// lives here; screens compose these.
import { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextStyle,
  View,
  ViewStyle,
} from "react-native";

import { DocStatus } from "../types";
import { colors, font, radius, shadow, spacing, statusColors } from "./theme";

// --- Button ---------------------------------------------------------------

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

export function Button({
  label,
  onPress,
  variant = "primary",
  disabled,
  loading,
  icon,
  small,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  icon?: string; // a glyph, e.g. "＋"
  small?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const off = disabled || loading;
  const v = BTN_VARIANTS[variant];
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      style={({ pressed }) => [
        styles.btn,
        small && styles.btnSmall,
        { backgroundColor: v.bg, borderColor: v.border },
        pressed && !off && { opacity: 0.85 },
        off && styles.btnOff,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.fg} size="small" />
      ) : (
        <View style={styles.btnInner}>
          {icon && <Text style={[styles.btnText, { color: v.fg }, small && font.small]}>{icon}</Text>}
          <Text style={[styles.btnText, { color: v.fg }, small && font.small]}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

const BTN_VARIANTS: Record<ButtonVariant, { bg: string; fg: string; border: string }> = {
  primary: { bg: colors.primary, fg: colors.white, border: colors.primary },
  secondary: { bg: colors.surface, fg: colors.primary, border: colors.primary },
  danger: { bg: colors.surface, fg: colors.danger, border: colors.danger },
  ghost: { bg: "transparent", fg: colors.sub, border: "transparent" },
};

// --- Card -----------------------------------------------------------------

export function Card({
  children,
  tone = "default",
  style,
}: {
  children: ReactNode;
  tone?: "default" | "warn";
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.card, tone === "warn" && styles.cardWarn, style]}>{children}</View>
  );
}

// --- StatusPill -----------------------------------------------------------

const STATUS_GLYPH: Record<DocStatus, string> = {
  processing: "",
  ready: "✓",
  failed: "✕",
};

export function StatusPill({ status }: { status: DocStatus }) {
  const c = statusColors[status];
  return (
    <View style={[styles.pill, { backgroundColor: c.bg }]}>
      {status === "processing" ? (
        <ActivityIndicator size="small" color={c.fg} />
      ) : (
        <Text style={[styles.pillGlyph, { color: c.fg }]}>{STATUS_GLYPH[status]}</Text>
      )}
      <Text style={[styles.pillText, { color: c.fg }]}>{status}</Text>
    </View>
  );
}

// --- Chip (toggle) --------------------------------------------------------

export function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.chip, active && styles.chipOn, pressed && { opacity: 0.8 }]}
    >
      <Text style={[styles.chipText, active && styles.chipTextOn]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

// --- Badge ----------------------------------------------------------------

export function Badge({ label }: { label: string }) {
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>{label}</Text>
    </View>
  );
}

// --- TextField ------------------------------------------------------------

export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
  editable = true,
  autoFocus,
}: {
  label?: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  multiline?: boolean;
  editable?: boolean;
  autoFocus?: boolean;
}) {
  return (
    <View style={{ gap: spacing.xs }}>
      {label && <Text style={styles.fieldLabel}>{label}</Text>}
      <TextInput
        style={[styles.input, multiline && styles.inputMultiline]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.faint}
        multiline={multiline}
        editable={editable}
        autoFocus={autoFocus}
      />
    </View>
  );
}

// --- EmptyState -----------------------------------------------------------

export function EmptyState({
  icon,
  title,
  hint,
}: {
  icon: string; // emoji glyph
  title: string;
  hint?: string;
}) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyIcon}>{icon}</Text>
      <Text style={styles.emptyTitle}>{title}</Text>
      {hint && <Text style={styles.emptyHint}>{hint}</Text>}
    </View>
  );
}

// --- SectionHeader --------------------------------------------------------

export function SectionHeader({ label, style }: { label: string; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.sectionHeader, style]}>{label}</Text>;
}

// --- ErrorText ------------------------------------------------------------

export function ErrorText({ children }: { children: ReactNode }) {
  return (
    <View style={styles.errorBox}>
      <Text style={styles.errorGlyph}>⚠</Text>
      <Text style={styles.errorText}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  btn: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  btnSmall: { paddingVertical: 8, paddingHorizontal: spacing.md, flex: 1 },
  btnOff: { opacity: 0.45 },
  btnInner: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  btnText: { ...font.bodyStrong },

  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadow,
  },
  cardWarn: { borderColor: colors.danger, backgroundColor: colors.dangerSoft },

  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: 3,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    alignSelf: "flex-start",
  },
  pillGlyph: { fontSize: 12, fontWeight: "700" },
  pillText: { ...font.tiny, textTransform: "capitalize" },

  chip: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    maxWidth: 220,
  },
  chipOn: { backgroundColor: colors.primary },
  chipText: { ...font.small, color: colors.primary },
  chipTextOn: { color: colors.white },

  badge: {
    alignSelf: "flex-start",
    backgroundColor: colors.danger,
    borderRadius: radius.sm,
    paddingVertical: 3,
    paddingHorizontal: spacing.sm,
  },
  badgeText: { ...font.tiny, color: colors.white, letterSpacing: 0.5 },

  fieldLabel: { ...font.small, color: colors.sub, fontWeight: "600" },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    ...font.body,
    color: colors.text,
  },
  inputMultiline: { minHeight: 88, textAlignVertical: "top" },

  empty: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xxl },
  emptyIcon: { fontSize: 40 },
  emptyTitle: { ...font.bodyStrong, color: colors.sub },
  emptyHint: { ...font.small, color: colors.faint, textAlign: "center" },

  sectionHeader: {
    ...font.small,
    fontWeight: "700",
    color: colors.faint,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },

  errorBox: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "flex-start",
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  errorGlyph: { fontSize: 16, color: colors.danger },
  errorText: { ...font.small, color: colors.danger, flex: 1 },
});
