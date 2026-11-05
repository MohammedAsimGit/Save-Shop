/**
 * Design tokens.
 *
 * Source of truth for the React Native app (StyleSheet). The web app mirrors the
 * same palette in `apps/web/src/styles/index.css` via Tailwind's `@theme` block,
 * because Tailwind v4 reads CSS, not TypeScript. If you change a colour here,
 * change it there too and note it in the pull request.
 *
 * Palette plus layout scale only - no component styles belong in this package.
 */

export const colors = {
  /** Backgrounds */
  background: '#f8fafc',
  surface: '#ffffff',
  surfaceMuted: '#f1f5f9',
  /** Text */
  text: '#0f172a',
  textMuted: '#475569',
  /** Brand + accents */
  primary: '#0f766e',
  primaryContrast: '#f0fdfa',
  /** Status */
  success: '#15803d',
  warning: '#b45309',
  danger: '#b91c1c',
  /** Borders */
  border: '#e2e8f0',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radii = {
  sm: 6,
  md: 10,
  lg: 16,
  pill: 999,
} as const;

export const fontSizes = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 20,
  xl: 26,
} as const;

export const fontWeights = {
  regular: '400',
  medium: '500',
  bold: '700',
} as const;

export type AppColors = typeof colors;
export type AppSpacing = typeof spacing;
