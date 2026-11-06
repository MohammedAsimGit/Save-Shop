import {
  fontSizes,
  fontWeights,
  layout,
  lineHeights,
  palette,
  radii,
  spacing,
  themes,
  type ThemeColors,
  type ThemeName,
} from '@smart-shopping/shared';

/**
 * Mobile theme primitives.
 *
 * Colours come from `@smart-shopping/shared` so web and mobile cannot drift.
 * Screens read the active palette from <AppThemeProvider>; only layout constants
 * live here because they do not change between themes.
 */

export { fontSizes, fontWeights, layout, lineHeights, palette, radii, spacing, themes };
export type { ThemeColors, ThemeName };

/** Light palette, kept for any module that renders before the provider mounts. */
export const theme = {
  colors: themes.light,
  spacing,
  radii,
  fontSizes,
  screen: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    gap: spacing.lg,
  },
} as const;

export type StatusTone = 'ok' | 'warn' | 'error' | 'neutral';

/** Tinted status chips, derived per theme so dark mode stays legible. */
export function statusToneColors(
  colors: ThemeColors,
): Record<StatusTone, { background: string; text: string }> {
  return {
    ok: { background: colors.primarySoft, text: colors.success },
    warn: { background: 'rgba(245, 158, 11, 0.16)', text: colors.warning },
    error: { background: 'rgba(220, 38, 38, 0.14)', text: colors.danger },
    neutral: { background: colors.surfaceMuted, text: colors.textMuted },
  };
}

/** Elevation that reads correctly on both themes. */
export function cardShadow(isDark: boolean) {
  return {
    shadowColor: '#0f172a',
    shadowOpacity: isDark ? 0.45 : 0.08,
    shadowRadius: isDark ? 18 : 12,
    shadowOffset: { width: 0, height: isDark ? 8 : 4 },
    elevation: isDark ? 6 : 3,
  } as const;
}
