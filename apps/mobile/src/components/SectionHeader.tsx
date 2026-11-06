import { Pressable, StyleSheet, Text, View } from 'react-native';

import { fontSizes, spacing, type ThemeColors } from '../theme';
import { useAppTheme } from '../theme/ThemeProvider';

/** Title + optional "See all" action, with one consistent rhythm everywhere. */
export function SectionHeader({
  title,
  actionLabel,
  onAction,
  description,
}: {
  readonly title: string;
  readonly actionLabel?: string;
  readonly onAction?: () => void;
  readonly description?: string;
}) {
  const { colors } = useAppTheme();
  const styles = buildStyles(colors);

  return (
    <View style={styles.row}>
      <View style={styles.copy}>
        <Text style={styles.title}>{title}</Text>
        {description ? (
          <Text style={styles.description} numberOfLines={2}>
            {description}
          </Text>
        ) : null}
      </View>
      {actionLabel && onAction ? (
        <Pressable accessibilityRole="button" onPress={onAction} hitSlop={6}>
          <Text style={styles.action}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const buildStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      gap: spacing.md,
    },
    copy: { flex: 1, gap: 2 },
    title: { fontSize: fontSizes.lg, fontWeight: '700', color: colors.text },
    description: { fontSize: fontSizes.xs, color: colors.textMuted, lineHeight: 17 },
    action: { fontSize: fontSizes.sm, fontWeight: '600', color: colors.primary },
  });
