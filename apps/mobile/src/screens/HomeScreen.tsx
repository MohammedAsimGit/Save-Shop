import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChevronRight, ShoppingBag, UserRound } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  categories,
  demoProducts,
  lowestOffer,
  marketplaces,
  type DemoMarketplace,
} from '@smart-shopping/shared';

import { CategoryChip } from '../components/CategoryChip';
import { DemoNotice } from '../components/DemoNotice';
import { ProductCard } from '../components/ProductCard';
import { PromotionalBanner } from '../components/PromotionalBanner';
import { SearchBar } from '../components/SearchBar';
import { SectionHeader } from '../components/SectionHeader';
import { formatMoney } from '../lib/format';
import type { RootStackParamList, TabParamList } from '../navigation/types';
import { fontSizes, radii, spacing, type ThemeColors } from '../theme';
import { useAppTheme } from '../theme/ThemeProvider';

type Props = BottomTabScreenProps<TabParamList, 'Home'>;

/**
 * Mobile landing screen.
 *
 * Mirrors the web home: search first, then discovery rails and a two-column
 * product grid. All catalogue content is shared sample data and labelled.
 */
export function HomeScreen({ navigation }: Props) {
  const rootNavigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { colors } = useAppTheme();
  const styles = buildStyles(colors);
  const [query, setQuery] = useState('');

  const featured = demoProducts.slice(0, 4);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.headerRow}>
        <View style={styles.greeting}>
          <Text style={styles.eyebrow}>SAVE SMARTER</Text>
          <Text style={styles.heading}>Find the real price</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open profile"
          onPress={() => navigation.navigate('Profile')}
          style={styles.avatar}
        >
          <UserRound size={18} color={colors.primary} />
        </Pressable>
      </View>

      <SearchBar
        value={query}
        onChangeText={setQuery}
        onSubmit={(value) => navigation.navigate('Search', { query: value })}
      />

      <PromotionalBanner
        title="Same product, up to 30% difference"
        description="Marketplace prices drift apart constantly. Put the offers side by side and the gap is obvious."
        onPress={() => navigation.navigate('Search', undefined)}
      />

      <View style={styles.section}>
        <SectionHeader
          title="Categories"
          actionLabel="All"
          onAction={() => navigation.navigate('Search', undefined)}
        />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.rail}
        >
          {categories.map((category) => (
            <CategoryChip
              key={category.id}
              category={category}
              onPress={() => navigation.navigate('Search', { category: category.id })}
            />
          ))}
        </ScrollView>
      </View>

      <View style={styles.section}>
        <SectionHeader
          title="Marketplaces"
          description="Only providers we can access legitimately appear here."
        />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.rail}
        >
          {marketplaces.map((marketplace) => (
            <MobileMarketplaceCard
              key={marketplace.id}
              marketplace={marketplace}
              onPress={() => navigation.navigate('Search', { marketplace: marketplace.id })}
            />
          ))}
        </ScrollView>
      </View>

      <View style={styles.section}>
        <SectionHeader
          title="Biggest demo savings"
          actionLabel="See all"
          onAction={() => navigation.navigate('Search', undefined)}
        />
        <View style={styles.grid}>
          {featured.map((product) => (
            <View key={product.id} style={styles.gridItem}>
              <ProductCard
                product={product}
                onPress={(productId) => rootNavigation.navigate('Product', { productId })}
              />
            </View>
          ))}
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={() => rootNavigation.navigate('Product', { productId: demoProducts[0]?.id ?? '' })}
        style={styles.howItWorks}
      >
        <ShoppingBag size={18} color={colors.primary} />
        <View style={styles.howCopy}>
          <Text style={styles.howTitle}>How SaveShop compares</Text>
          <Text style={styles.howBody}>
            Search once, see every marketplace, follow the lowest verified offer.
          </Text>
        </View>
        <ChevronRight size={16} color={colors.textSubtle} />
      </Pressable>

      <DemoNotice />
    </ScrollView>
  );
}

function MobileMarketplaceCard({
  marketplace,
  onPress,
}: {
  readonly marketplace: DemoMarketplace;
  readonly onPress: () => void;
}) {
  const { colors } = useAppTheme();
  const styles = buildStyles(colors);
  const available = demoProducts.filter((product) =>
    product.offers.some((offer) => offer.marketplaceId === marketplace.id && offer.inStock),
  );
  const cheapest = available.reduce<number | null>((min, product) => {
    const price = lowestOffer(product)?.price.amountMinor;
    if (price === undefined) return min;
    return min === null || price < min ? price : min;
  }, null);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.marketplace, pressed && styles.pressed]}
    >
      <View style={[styles.marketplaceTile, { backgroundColor: marketplace.accent }]}>
        <Text style={styles.marketplaceInitial}>{marketplace.short}</Text>
      </View>
      <View style={styles.marketplaceCopy}>
        <Text style={styles.marketplaceName} numberOfLines={1}>
          {marketplace.name}
        </Text>
        <Text style={styles.marketplaceMeta} numberOfLines={1}>
          {available.length} products
          {cheapest !== null
            ? ` · from ${formatMoney({ amountMinor: cheapest, currency: 'INR' })}`
            : ''}
        </Text>
      </View>
    </Pressable>
  );
}

const buildStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    content: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.xxxl,
      gap: spacing.lg,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
    },
    greeting: { flex: 1, gap: 2 },
    eyebrow: { fontSize: 10, fontWeight: '700', letterSpacing: 1.4, color: colors.primary },
    heading: {
      fontSize: fontSizes.xxl,
      fontWeight: '800',
      color: colors.text,
      letterSpacing: -0.5,
    },
    avatar: {
      width: 40,
      height: 40,
      borderRadius: radii.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primarySoft,
    },
    section: { gap: spacing.md },
    rail: { gap: spacing.sm, paddingRight: spacing.lg },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
    gridItem: { width: '48%' },
    howItWorks: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      padding: spacing.lg,
      borderRadius: radii.xl,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    howCopy: { flex: 1, gap: 2 },
    howTitle: { fontSize: fontSizes.sm, fontWeight: '600', color: colors.text },
    howBody: { fontSize: fontSizes.xs, color: colors.textMuted, lineHeight: 17 },
    marketplace: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      width: 210,
      padding: spacing.md,
      borderRadius: radii.lg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    pressed: { opacity: 0.9 },
    marketplaceTile: {
      width: 40,
      height: 40,
      borderRadius: radii.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    marketplaceInitial: { color: '#ffffff', fontWeight: '700', fontSize: fontSizes.md },
    marketplaceCopy: { flex: 1, gap: 1 },
    marketplaceName: { fontSize: fontSizes.sm, fontWeight: '600', color: colors.text },
    marketplaceMeta: { fontSize: 11, color: colors.textMuted },
  });
