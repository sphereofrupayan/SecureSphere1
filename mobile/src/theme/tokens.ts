export const colors = {
  // Deep obsidian & cyber-slate surfaces
  background: "#0B0E14",
  backgroundSecondary: "#0F141F",
  surface: "#141A26",
  surfaceElevated: "#1A2233",
  surfacePressed: "#222C42",
  surfaceInset: "#0E131D",

  // Brand & cyber accents
  primary: "#3B82F6",
  primaryBright: "#60A5FA",
  primaryDeep: "#1D4ED8",
  primarySoft: "rgba(59, 130, 246, 0.16)",
  primaryBorder: "rgba(96, 165, 250, 0.36)",
  cyan: "#38BDF8",
  cyanSoft: "rgba(56, 189, 248, 0.14)",

  // Text hierarchy (WCAG AA+ on dark surfaces)
  text: "#F1F5F9",
  textSecondary: "#94A3B8",
  textMuted: "#64748B",
  onPrimary: "#FFFFFF",

  // Borders & hairlines
  border: "rgba(148, 163, 184, 0.14)",
  borderStrong: "rgba(148, 163, 184, 0.24)",
  borderFocus: "#60A5FA",

  // Semantic status
  success: "#34D399",
  successSoft: "rgba(52, 211, 153, 0.14)",
  successBorder: "rgba(52, 211, 153, 0.32)",
  warning: "#FBBF24",
  warningSoft: "rgba(251, 191, 36, 0.14)",
  warningBorder: "rgba(251, 191, 36, 0.32)",
  danger: "#F87171",
  dangerSolid: "#EF4444",
  dangerSoft: "rgba(248, 113, 113, 0.14)",
  dangerBorder: "rgba(248, 113, 113, 0.32)",
} as const;

export const gradients = {
  background: ["#0B0E14", "#0F1624", "#0B0E14"] as const,
  primaryButton: ["#3B82F6", "#1D4ED8"] as const,
  heroCard: ["rgba(59, 130, 246, 0.16)", "rgba(56, 189, 248, 0.05)"] as const,
  shield: ["#60A5FA", "#2563EB", "#1E40AF"] as const,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const radii = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  pill: 9999,
} as const;

export const typography = {
  hero: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "700" as const,
    letterSpacing: -0.6,
  },
  title: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "700" as const,
    letterSpacing: -0.4,
  },
  heading: {
    fontSize: 17,
    lineHeight: 23,
    fontWeight: "600" as const,
    letterSpacing: -0.2,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "400" as const,
  },
  bodyMedium: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "500" as const,
  },
  caption: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500" as const,
  },
  label: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600" as const,
    letterSpacing: 0.4,
  },
  mono: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600" as const,
    letterSpacing: 0.6,
  },
} as const;

export const shadows = {
  card: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 16,
    elevation: 5,
  },
  glow: {
    shadowColor: "#3B82F6",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.32,
    shadowRadius: 14,
    elevation: 6,
  },
} as const;

export const theme = {
  colors,
  gradients,
  spacing,
  radii,
  typography,
  shadows,
} as const;

export type AppTheme = typeof theme;
