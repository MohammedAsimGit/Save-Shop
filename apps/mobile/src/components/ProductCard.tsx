import {
  Camera,
  Headphones,
  Laptop,
  Shirt,
  Smartphone,
  Store,
  Watch,
  Footprints,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { availableMarketplaceCount, lowestOffer, type DemoProduct } from '@smart-shopping/shared';

import { formatCompactCount, formatMoney } from '../lib/format';
import { cardShadow, fontSizes, radii, spacing, type ThemeColors } from '../theme';
import { useAppTheme } from '../theme/ThemeProvider';

const iconFor = (key: string): LucideIcon => {
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
    default:
      return Store;
  }
};

const tintFor = (category: string): string => {
  const tints: Record<string, string> = {
    audio: '#dcfce7',
    phones: '#e0f2fe',
    wearables: '#ede9fe',
    laptops: '#f1f5f9',
    cameras: '#fef3c7',
    footwear: '#ffe4e6',
    fashion: '#dbeafe',
  };
  return tints[category] ?? '#f1f5f9';
};

/** Product tile: cheapest verified offer is the loudest number on the card. */
export function ProductCard({
  product,
  onPress,
}: {
  readonly product: DemoProduct;
  readonly onPress: (productId: string) => void;
}) {
  const { colors, isDark } = useAppTheme();
  const styles = buildStyles(colors, isDark);
  const Icon = iconFor(product.icon);
  const lowest = lowestOffer(product);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${product.title}, lowest price ${
        lowest ? formatMoney(lowest.price) : 'unavailable'
      }`}
      onPress={() => onPress(product.id)}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View
        style={[
          styles.artwork,
          { backgroundColor: isDark ? colors.surfaceMuted : tintFor(product.category) },
        ]}
      >
        <Icon size={44} color={isDark ? colors.textSubtle : '#334155'} strokeWidth={1.2} />
        <View style={styles.demoBadge}>
          <Text style={styles.demoBadgeText}>DEMO</Text>
        </View>
      </View>

      <View style={styles.body}>
        <Text style={styles.brand}>{product.brand}</Text>
        <Text style={styles.title} numberOfLines={2}>
          {product.title}
        </Text>

        <Text style={styles.rating}>
          ★ {product.rating.toFixed(1)} ({formatCompactCount(product.reviewCount)})
        </Text>

        <Text style={styles.priceLabel}>Lowest price</Text>
        {lowest ? (
          <Text style={styles.price}>{formatMoney(lowest.price)}</Text>
        ) : (
          <Text style={styles.outOfStock}>Out of stock</Text>
        )}

        <View style={styles.stores}>
          <Store size={11} color={colors.textSubtle} />
          <Text style={styles.storesText}>
            {availableMarketplaceCount(product)}{' '}
            {availableMarketplaceCount(product) === 1 ? 'marketplace' : 'marketplaces'}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const buildStyles = (colors: ThemeColors, isDark: boolean) =>
  StyleSheet.create({
    card: {
      flex: 1,
      minWidth: 0,
      borderRadius: radii.xl,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
      ...cardShadow(isDark),
    },
    pressed: { opacity: 0.92 },
    artwork: {
      height: 108,
      alignItems: 'center',
      justifyContent: 'center',
    },
    demoBadge: {
      position: 'absolute',
      top: spacing.sm,
      right: spacing.sm,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: radii.pill,
      backgroundColor: isDark ? 'rgba(2,6,23,0.6)' : 'rgba(255,255,255,0.8)',
    },
    demoBadgeText: {
      fontSize: 9,
      fontWeight: '700',
      letterSpacing: 0.8,
      color: isDark ? colors.textMuted : '#334155',
    },
    body: { padding: spacing.md, gap: 2 },
    brand: {
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 1,
      color: colors.textSubtle,
      textTransform: 'uppercase',
    },
    title: { fontSize: fontSizes.sm, fontWeight: '600', color: colors.text, lineHeight: 18 },
    rating: { fontSize: fontSizes.xs, color: colors.textMuted, marginTop: 2 },
    priceLabel: { fontSize: 10, color: colors.textSubtle, marginTop: spacing.xs },
    price: { fontSize: fontSizes.lg, fontWeight: '800', color: colors.primary },
    outOfStock: { fontSize: fontSizes.sm, fontWeight: '600', color: colors.textMuted },
    stores: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
    storesText: { fontSize: 10, color: colors.textSubtle },
  });
