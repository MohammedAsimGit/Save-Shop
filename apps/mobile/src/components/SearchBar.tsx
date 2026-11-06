import { Search, X } from 'lucide-react-native';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { fontSizes, radii, spacing, type ThemeColors } from '../theme';
import { useAppTheme } from '../theme/ThemeProvider';

/** Search field used on the home and results screens. */
export function SearchBar({
  value,
  onChangeText,
  onSubmit,
  placeholder = 'Search products across marketplaces',
}: {
  readonly value: string;
  readonly onChangeText: (value: string) => void;
  readonly onSubmit?: (value: string) => void;
  readonly placeholder?: string;
}) {
  const { colors } = useAppTheme();
  const styles = buildStyles(colors);

  return (
    <View style={styles.container}>
      <Search size={18} color={colors.textSubtle} />
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={() => onSubmit?.(value)}
        placeholder={placeholder}
        placeholderTextColor={colors.textSubtle}
        returnKeyType="search"
        accessibilityLabel="Product search"
        autoCorrect={false}
      />
      {value.length > 0 && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          onPress={() => onChangeText('')}
          hitSlop={8}
        >
          <X size={16} color={colors.textSubtle} />
        </Pressable>
      )}
    </View>
  );
}

const buildStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      height: 52,
      paddingHorizontal: spacing.lg,
      borderRadius: radii.pill,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    input: {
      flex: 1,
      height: '100%',
      fontSize: fontSizes.sm + 1,
      color: colors.text,
      paddingVertical: 0,
    },
  });
