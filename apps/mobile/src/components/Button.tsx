import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { fontSizes, radii, spacing, type ThemeColors } from '../theme';
import { useAppTheme } from '../theme/ThemeProvider';

type Variant = 'primary' | 'secondary' | 'ghost';

/** Primary action control. Disabled state is explicit, never implied by colour. */
export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  icon,
  block = false,
}: {
  readonly label: string;
  readonly onPress?: () => void;
  readonly variant?: Variant;
  readonly disabled?: boolean;
  readonly icon?: ReactNode;
  readonly block?: boolean;
}) {
  const { colors } = useAppTheme();
  const styles = buildStyles(colors);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        variant === 'primary' && styles.primary,
        variant === 'secondary' && styles.secondary,
        variant === 'ghost' && styles.ghost,
        block && styles.block,
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      {icon}
      <Text
        style={[styles.label, variant === 'primary' ? styles.primaryLabel : styles.secondaryLabel]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const buildStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    base: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      height: 44,
      paddingHorizontal: spacing.xl,
      borderRadius: radii.pill,
    },
    primary: { backgroundColor: colors.primary },
    secondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
    ghost: { backgroundColor: 'transparent' },
    block: { alignSelf: 'stretch' },
    pressed: { opacity: 0.85 },
    disabled: { opacity: 0.5 },
    label: { fontSize: fontSizes.sm, fontWeight: '600' },
    primaryLabel: { color: colors.onPrimary },
    secondaryLabel: { color: colors.text },
  });
