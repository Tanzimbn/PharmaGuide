// Design tokens for the M3 app UI. Single source of truth for colors, spacing,
// type scale, radii, and shadows so screens/components stay visually consistent.
// Light theme only (dark mode is out of scope until later).

export const colors = {
  // brand / actions
  primary: "#1f6feb",
  primaryDown: "#1a5fd0",
  primarySoft: "#e8f0fe",

  // surfaces
  bg: "#f6f7f9",
  surface: "#ffffff",
  border: "#e4e7ec",

  // text
  text: "#101828",
  sub: "#667085",
  faint: "#98a2b3",

  // semantics
  success: "#0a7d24",
  successSoft: "#e7f6ec",
  warn: "#b25e09",
  warnSoft: "#fdf2e3",
  danger: "#b00020",
  dangerSoft: "#fdecef",

  white: "#ffffff",
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
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

export const font = {
  h1: { fontSize: 24, fontWeight: "700" as const },
  h2: { fontSize: 18, fontWeight: "700" as const },
  body: { fontSize: 15, fontWeight: "400" as const },
  bodyStrong: { fontSize: 15, fontWeight: "600" as const },
  small: { fontSize: 13, fontWeight: "400" as const },
  tiny: { fontSize: 11, fontWeight: "600" as const },
} as const;

// Subtle elevation for cards / the tab bar.
export const shadow = {
  shadowColor: "#101828",
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.06,
  shadowRadius: 8,
  elevation: 2,
} as const;
