import { StyleSheet, Text, View } from 'react-native';

import { statusToneColors, type StatusTone } from '../theme';
import { useAppTheme } from '../theme/ThemeProvider';

export function StatusPill({ tone, label }: { readonly tone: StatusTone; readonly label: string }) {
  const { colors } = useAppTheme();
  const toneColors = statusToneColors(colors)[tone];

  return (
    <View style={[styles.pill, { backgroundColor: toneColors.background }]}>
      <View style={[styles.dot, { backgroundColor: toneColors.text }]} />
      <Text style={[styles.label, { color: toneColors.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  label: { fontSize: 12, fontWeight: '600' },
});
