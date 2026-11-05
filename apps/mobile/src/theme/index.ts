import { colors, fontSizes, radii, spacing } from '@smart-shopping/shared';

/**
 * Mobile theme.
 *
 * Values come from `@smart-shopping/shared` so web and mobile cannot drift on
 * brand colours or spacing. Only React Native specific composition lives here.
 */
export const theme = {
  colors,
  spacing,
  radii,
  fontSizes,
  screen: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    gap: spacing.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
} as const;

export const statusTone = {
  ok: { background: '#dcfce7', text: colors.success },
  warn: { background: '#fef3c7', text: colors.warning },
  error: { background: '#fee2e2', text: colors.danger },
  neutral: { background: colors.surfaceMuted, text: colors.textMuted },
} as const;

export type StatusTone = keyof typeof statusTone;
