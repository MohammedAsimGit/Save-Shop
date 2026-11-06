import { FlaskConical } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { DEMO_DATA_NOTICE } from '@smart-shopping/shared';

import { radii, spacing, type ThemeColors } from '../theme';
import { useAppTheme } from '../theme/ThemeProvider';

/** Must accompany any screen that renders catalogue data. */
export function DemoNotice() {
  const { colors } = useAppTheme();
  const styles = buildStyles(colors);

  return (
    <View style={styles.container}>
      <FlaskConical size={13} color={colors.textSubtle} />
      <Text style={styles.text}>{DEMO_DATA_NOTICE}</Text>
    </View>
  );
}

const buildStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      padding: spacing.md,
      borderRadius: radii.md,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: colors.borderStrong,
      backgroundColor: colors.surfaceMuted,
    },
    text: { flex: 1, fontSize: 11, lineHeight: 16, color: colors.textMuted },
  });
