// Reusable UI kit, styled from theme tokens. Pure RN only — icons are
// Unicode/emoji glyphs (no @expo/vector-icons, which pulls the native expo-font
// module and would force a dev-client rebuild). No business logic here; screens
// compose these.
import { ReactNode } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StatusBar as RNStatusBar,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextStyle,
  View,
  ViewStyle,
} from "react-native";

import { DocStatus } from "../types";
import { Icon, IconName } from "./icons";
import { colors, font, headerShadow, radius, shadow, spacing, statusColors } from "./theme";

const ANDROID_TOP = Platform.OS === "android" ? (RNStatusBar.currentHeight ?? 0) : 0;

// --- ScreenHeader (teal banner) -------------------------------------------

export function ScreenHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.header}>
      <Text style={styles.headerTitle}>{title}</Text>
      {subtitle && <Text style={styles.headerSub}>{subtitle}</Text>}
    </View>
  );
}

// --- PdfTile (rounded "PDF" badge) ----------------------------------------

export function PdfTile({ size = 44 }: { size?: number }) {
  return (
    <View style={[styles.pdfTile, { width: size, height: size, borderRadius: size * 0.3 }]}>
      <Text style={styles.pdfTileText}>PDF</Text>
    </View>
  );
}

// --- Button ---------------------------------------------------------------

type ButtonVariant = "primary" | "accent" | "secondary" | "danger" | "ghost";

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
  icon?: IconName;
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
          {icon && <Icon name={icon} color={v.fg} size={small ? 16 : 18} strokeWidth={2.2} />}
          <Text style={[styles.btnText, { color: v.fg }, small && font.small]}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

const BTN_VARIANTS: Record<ButtonVariant, { bg: string; fg: string; border: string }> = {
  primary: { bg: colors.primary, fg: colors.white, border: colors.primary },
  accent: { bg: colors.accent, fg: colors.accentText, border: colors.accent },
  secondary: { bg: colors.surface, fg: colors.primaryDown, border: colors.border },
  danger: { bg: colors.surface, fg: colors.danger, border: colors.dangerSoft },
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

const STATUS_LABEL: Record<DocStatus, string> = {
  processing: "indexing",
  ready: "ready",
  failed: "failed",
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
      <Text style={[styles.pillText, { color: c.fg }]}>{STATUS_LABEL[status]}</Text>
    </View>
  );
}

// --- Chip (toggle, with indicator dot) ------------------------------------

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
      <View style={[styles.chipDot, active ? styles.chipDotOn : styles.chipDotOff]} />
      <Text style={[styles.chipText, active && styles.chipTextOn]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

// --- Badge ----------------------------------------------------------------

export function Badge({ label, tone = "danger" }: { label: string; tone?: "danger" | "warn" }) {
  const c = tone === "warn" ? { fg: colors.warn, bg: colors.warnSoft } : { fg: colors.danger, bg: colors.dangerSoft };
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]}>
      <Text style={[styles.badgeText, { color: c.fg }]}>{label}</Text>
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
  secureTextEntry,
  autoCapitalize,
  autoCorrect,
}: {
  label?: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  multiline?: boolean;
  editable?: boolean;
  autoFocus?: boolean;
  secureTextEntry?: boolean;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  autoCorrect?: boolean;
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
        secureTextEntry={secureTextEntry}
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCorrect}
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
  icon: IconName;
  title: string;
  hint?: string;
}) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIconWrap}>
        <Icon name={icon} size={30} color={colors.primaryDown} strokeWidth={1.8} />
      </View>
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
      <Icon name="alert" size={16} color={colors.danger} />
      <Text style={styles.errorText}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: colors.header,
    paddingTop: ANDROID_TOP + spacing.lg,
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.xl,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    ...headerShadow,
  },
  headerTitle: { ...font.h1, color: colors.headerText },
  headerSub: { ...font.small, color: colors.headerSub, marginTop: spacing.xs },

  pdfTile: {
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  pdfTileText: { fontSize: 11, fontWeight: "800", color: colors.primaryDown, letterSpacing: 0.5 },

  btn: {
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingVertical: 16,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  btnSmall: { paddingVertical: 10, paddingHorizontal: spacing.md, borderRadius: radius.md, flex: 1 },
  btnOff: { opacity: 0.45 },
  btnInner: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  btnText: { ...font.bodyStrong },

  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    padding: spacing.lg,
    ...shadow,
  },
  cardWarn: { borderColor: colors.warnSoft, backgroundColor: "#FFFBF2" },

  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: 4,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    alignSelf: "flex-start",
  },
  pillGlyph: { fontSize: 12, fontWeight: "800" },
  pillText: { ...font.tiny, textTransform: "capitalize" },

  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingVertical: 7,
    paddingHorizontal: spacing.md,
    maxWidth: 220,
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipDot: { width: 7, height: 7, borderRadius: 999 },
  chipDotOn: { backgroundColor: colors.accent },
  chipDotOff: { backgroundColor: colors.faint },
  chipText: { ...font.small, color: colors.primaryDown, fontWeight: "600" },
  chipTextOn: { color: colors.white },

  badge: {
    alignSelf: "flex-start",
    borderRadius: radius.sm,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
  },
  badgeText: { ...font.tiny, letterSpacing: 0.8 },

  fieldLabel: { ...font.small, color: colors.sub, fontWeight: "700" },
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
  inputMultiline: { minHeight: 96, textAlignVertical: "top" },

  empty: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xxl },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 24,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs,
  },
  emptyTitle: { ...font.bodyStrong, color: colors.text },
  emptyHint: { ...font.small, color: colors.faint, textAlign: "center", maxWidth: 280 },

  sectionHeader: {
    ...font.label,
    color: colors.faint,
    textTransform: "uppercase",
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
  errorText: { ...font.small, color: colors.danger, flex: 1 },
});
