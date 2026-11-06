import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { cardShadow, fontSizes, radii, spacing, type ThemeColors } from '../theme';
import { useAppTheme } from '../theme/ThemeProvider';

/** Generic surface with an optional title, used for settings and status blocks. */
export function Card({
  title,
  children,
}: {
  readonly title?: string;
  readonly children: ReactNode;
}) {
  const { colors, isDark } = useAppTheme();
  const styles = buildStyles(colors, isDark);

  return (
    <View style={styles.card}>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      {children}
    </View>
  );
}

const buildStyles = (colors: ThemeColors, isDark: boolean) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: radii.xl,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
      gap: spacing.sm,
      ...cardShadow(isDark),
    },
    title: { fontSize: fontSizes.md, fontWeight: '600', color: colors.text },
  });
