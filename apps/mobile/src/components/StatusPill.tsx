import { StyleSheet, Text, View } from 'react-native';

import { statusTone, theme, type StatusTone } from '../theme';

export function StatusPill({ tone, label }: { readonly tone: StatusTone; readonly label: string }) {
  const palette = statusTone[tone];

  return (
    <View style={[styles.pill, { backgroundColor: palette.background }]}>
      <View style={[styles.dot, { backgroundColor: palette.text }]} />
      <Text style={[styles.label, { color: palette.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    alignSelf: 'flex-start',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radii.pill,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  label: {
    fontSize: theme.fontSizes.xs,
    fontWeight: '600',
  },
});
