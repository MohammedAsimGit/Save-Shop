/**
 * Design tokens.
 *
 * Source of truth for both clients. The React Native app consumes these values
 * directly; the web app mirrors the same palette in `apps/web/src/styles/index.css`
 * via Tailwind's `@theme` block, because Tailwind v4 reads CSS, not TypeScript.
 * If you change a colour here, change it there too.
 *
 * Two themes exist so the dark foundation is real rather than a promise: every
 * surface, border and text colour has a dark counterpart with checked contrast.
 */

/** Raw brand ramp. Components should use a theme role, not a ramp step. */
export const palette = {
  green50: '#f0fdf4',
  green100: '#dcfce7',
  green200: '#bbf7d0',
  green500: '#22c55e',
  green600: '#16a34a',
  green700: '#15803d',
  green900: '#14532d',

  slate50: '#f8fafc',
  slate100: '#f1f5f9',
  slate200: '#e2e8f0',
  slate300: '#cbd5e1',
  slate400: '#94a3b8',
  slate500: '#64748b',
  slate600: '#475569',
  slate800: '#1e293b',
  slate900: '#0f172a',
  slate950: '#020617',

  white: '#ffffff',
  ink: '#111827',
  inkMuted: '#6b7280',
  border: '#e5e7eb',

  orange500: '#f97316',
  orange600: '#ea580c',
  amber500: '#f59e0b',
  red600: '#dc2626',
  blue600: '#2563eb',
} as const;

export interface ThemeColors {
  /** Page background. */
  readonly background: string;
  /** Background of a section that needs to separate itself from the page. */
  readonly backgroundAlt: string;
  /** Cards, sheets, popovers. */
  readonly surface: string;
  /** Low-emphasis fills: chips, skeletons, table stripes. */
  readonly surfaceMuted: string;
  /** Text on surface. */
  readonly text: string;
  /** Supportive text: descriptions, metadata. */
  readonly textMuted: string;
  /** Lowest-emphasis text: timestamps, legal. */
  readonly textSubtle: string;
  readonly border: string;
  /** Border on hover/selected states. */
  readonly borderStrong: string;
  readonly primary: string;
  readonly primaryDark: string;
  /** Tinted primary background for badges and callouts. */
  readonly primarySoft: string;
  /** Text/icon colour on top of `primary`. */
  readonly onPrimary: string;
  readonly success: string;
  readonly warning: string;
  readonly danger: string;
  /** Discount / price-drop accent. */
  readonly discount: string;
  /** Marketplace accent colours, used only for neutral initials tiles. */
  readonly marketplace: readonly string[];
  /** Overlay behind sheets. */
  readonly overlay: string;
}

export const themes: Record<'light' | 'dark', ThemeColors> = {
  light: {
    background: palette.slate50,
    backgroundAlt: palette.white,
    surface: palette.white,
    surfaceMuted: palette.slate100,
    text: palette.ink,
    textMuted: palette.inkMuted,
    textSubtle: palette.slate500,
    border: palette.border,
    borderStrong: palette.slate300,
    primary: palette.green600,
    primaryDark: palette.green700,
    primarySoft: palette.green50,
    onPrimary: palette.white,
    success: palette.green700,
    warning: '#b45309',
    danger: palette.red600,
    discount: palette.orange600,
    marketplace: ['#232f3e', '#2874f0', '#e23744', '#0f766e', '#7c3aed', '#b45309'],
    overlay: 'rgba(15, 23, 42, 0.45)',
  },
  dark: {
    background: palette.slate950,
    backgroundAlt: palette.slate900,
    surface: '#0b1220',
    surfaceMuted: palette.slate800,
    text: '#f8fafc',
    textMuted: '#cbd5e1',
    textSubtle: '#94a3b8',
    border: '#1e293b',
    borderStrong: '#334155',
    primary: palette.green500,
    primaryDark: palette.green600,
    primarySoft: 'rgba(34, 197, 94, 0.14)',
    onPrimary: '#052e16',
    success: '#4ade80',
    warning: '#fbbf24',
    danger: '#f87171',
    discount: '#fb923c',
    marketplace: ['#334155', '#1d4ed8', '#be123c', '#0f766e', '#6d28d9', '#b45309'],
    overlay: 'rgba(2, 6, 23, 0.7)',
  },
};

export type ThemeName = keyof typeof themes;

/** Backwards-compatible alias: the light theme. */
export const colors: ThemeColors = themes.light;

/**
 * Type scale. `display` and `xl` are for marketing surfaces; product titles use
 * `md`/`lg` so a dense list stays readable on a 360 px screen.
 */
export const fontSizes = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 22,
  xxl: 28,
  display: 36,
} as const;

export const lineHeights = {
  tight: 1.15,
  snug: 1.3,
  normal: 1.5,
  relaxed: 1.65,
} as const;

export const fontWeights = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
  black: '800',
} as const;

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  xxl: 28,
  pill: 999,
} as const;

/** Numeric elevation for React Native (Android `elevation`). */
export const elevation = {
  none: 0,
  card: 2,
  raised: 6,
  floating: 12,
} as const;

/** Cross-platform layout constants so both clients break at the same widths. */
export const layout = {
  /** Content max width on desktop; wider than this and line lengths suffer. */
  contentMaxWidth: 1180,
  /** Below this width the mobile treatment is used. */
  mobileBreakpoint: 768,
  /** Height of the sticky bottom navigation. */
  bottomNavHeight: 64,
} as const;

export type AppColors = ThemeColors;
export type AppSpacing = typeof spacing;
export type AppTheme = {
  readonly colors: ThemeColors;
  readonly spacing: typeof spacing;
  readonly radii: typeof radii;
  readonly fontSizes: typeof fontSizes;
};
