import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { theme } from '../theme';

export function Card({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.card.backgroundColor,
    borderRadius: theme.card.borderRadius,
    borderWidth: theme.card.borderWidth,
    borderColor: theme.card.borderColor,
    padding: theme.card.padding,
    gap: theme.card.gap,
  },
  title: {
    fontSize: theme.fontSizes.md,
    fontWeight: '600',
    color: theme.colors.text,
  },
});
