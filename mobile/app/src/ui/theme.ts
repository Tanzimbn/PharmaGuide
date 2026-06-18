// Design tokens — single source of truth for colors, spacing, type scale, radii,
// and shadows so screens/components stay visually consistent. Light theme only.
//
// Visual language ("PharmaGuide" Claude Design): calm teal brand + a lime accent
// for the primary action, soft off-white canvas, rounded white cards, pill chips
// with an indicator dot, and uppercase section labels. System fonts (no custom
// font = no native expo-font module); the look is carried by weight + tracking.

export const colors = {
  // brand / actions
  primary: "#0C9A86", // teal — primary buttons, links, active states
  primaryDown: "#0A6E60",
  primarySoft: "#E2F4F0", // teal tint — tiles, soft fills
  accent: "#D8F25C", // lime — the single highest-emphasis action (Add PDF)
  accentText: "#06302B", // dark green text on lime

  // header banner
  header: "#0C9A86",
  headerText: "#FFFFFF",
  headerSub: "rgba(255,255,255,0.82)",

  // surfaces
  bg: "#EFF3F2",
  surface: "#FFFFFF",
  border: "#E4EBE9",

  // text
  text: "#0E1A19",
  sub: "#5A6B68",
  faint: "#8A9997",

  // semantics
  success: "#0E7A53",
  successSoft: "#DDF3E7",
  warn: "#9A6B12",
  warnSoft: "#FFF1D6",
  danger: "#C2453B",
  dangerSoft: "#FBEAE8",

  white: "#FFFFFF",
} as const;

// Per-status colors for the document lifecycle (processing/ready/failed).
export const statusColors = {
  processing: { fg: colors.warn, bg: colors.warnSoft },
  ready: { fg: colors.success, bg: colors.successSoft },
  failed: { fg: colors.danger, bg: colors.dangerSoft },
} as const;

// 4pt spacing scale.
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 22, // cards
  pill: 999,
} as const;

export const font = {
  h1: { fontSize: 30, fontWeight: "800" as const, letterSpacing: -0.5 },
  h2: { fontSize: 18, fontWeight: "700" as const },
  body: { fontSize: 15, fontWeight: "400" as const },
  bodyStrong: { fontSize: 15, fontWeight: "700" as const },
  small: { fontSize: 13, fontWeight: "400" as const },
  tiny: { fontSize: 11, fontWeight: "700" as const },
  // uppercase eyebrow used by SectionHeader / answer labels
  label: { fontSize: 11, fontWeight: "800" as const, letterSpacing: 1.4 },
} as const;

// Subtle elevation for cards.
export const shadow = {
  shadowColor: "#0E1A19",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 12,
  elevation: 2,
} as const;

// Stronger elevation for the fixed header banner.
export const headerShadow = {
  shadowColor: "#0C9A86",
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.25,
  shadowRadius: 16,
  elevation: 6,
} as const;
