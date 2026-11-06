import {
  Camera,
  Headphones,
  Laptop,
  Shirt,
  Smartphone,
  Watch,
  Footprints,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Category } from '@smart-shopping/shared';

import { radii, type ThemeColors } from '../theme';
import { useAppTheme } from '../theme/ThemeProvider';

const iconFor = (key: Category['icon']): LucideIcon => {
  switch (key) {
    case 'headphones':
      return Headphones;
    case 'smartphone':
      return Smartphone;
    case 'watch':
      return Watch;
    case 'laptop':
      return Laptop;
    case 'camera':
      return Camera;
    case 'footprint':
      return Footprints;
    case 'shirt':
      return Shirt;
  }
};

/** Category rail item with a tinted circular icon. */
export function CategoryChip({
  category,
  active = false,
  onPress,
}: {
  readonly category: Category;
  readonly active?: boolean;
  readonly onPress: () => void;
}) {
  const { colors } = useAppTheme();
  const styles = buildStyles(colors);
  const Icon = iconFor(category.icon);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={styles.container}
    >
      <View style={[styles.icon, active && styles.iconActive]}>
        <Icon size={20} strokeWidth={1.8} color={active ? colors.onPrimary : colors.primary} />
      </View>
      <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
        {category.label}
      </Text>
    </Pressable>
  );
}

const buildStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { alignItems: 'center', gap: 6, width: 68 },
    icon: {
      width: 48,
      height: 48,
      borderRadius: radii.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceMuted,
    },
    iconActive: { backgroundColor: colors.primary },
    label: { fontSize: 11, fontWeight: '500', color: colors.textMuted },
    labelActive: { color: colors.primary, fontWeight: '700' },
  });
