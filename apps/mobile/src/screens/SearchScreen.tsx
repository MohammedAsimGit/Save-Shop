import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  categories,
  filterProducts,
  searchProducts,
  sortOptions,
  type CategoryId,
  type SortKey,
} from '@smart-shopping/shared';

import { CategoryChip } from '../components/CategoryChip';
import { DemoNotice } from '../components/DemoNotice';
import { ProductCard } from '../components/ProductCard';
import { SearchBar } from '../components/SearchBar';
import type { RootStackParamList, TabParamList } from '../navigation/types';
import { fontSizes, radii, spacing, type ThemeColors } from '../theme';
import { useAppTheme } from '../theme/ThemeProvider';

type Props = BottomTabScreenProps<TabParamList, 'Search'>;

/**
 * Comparison results.
 *
 * Filters are local state (the mobile surface has no URL to reproduce), but the
 * filtering logic itself is the shared, tested `filterProducts`.
 */
export function SearchScreen({ route, navigation }: Props) {
  const rootNavigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { colors } = useAppTheme();
  const styles = buildStyles(colors);

  const [query, setQuery] = useState(route.params?.query ?? '');
  const [category, setCategory] = useState<CategoryId | 'all'>(
    (route.params?.category as CategoryId | undefined) ?? 'all',
  );
  const [sort, setSort] = useState<SortKey>('relevance');
  const [inStockOnly, setInStockOnly] = useState(false);

  // A tap on a category from the home rail re-enters this tab with new params.
  useEffect(() => {
    if (route.params?.query !== undefined) setQuery(route.params.query);
    if (route.params?.category !== undefined) setCategory(route.params.category as CategoryId);
  }, [route.params?.query, route.params?.category]);

  const results = useMemo(
    () =>
      filterProducts(searchProducts(query), {
        query,
        category,
        sort,
        inStockOnly,
        marketplace: route.params?.marketplace ?? 'all',
      }),
    [query, category, sort, inStockOnly, route.params?.marketplace],
  );

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.heading}>{query ? `Results for “${query}”` : 'Compare products'}</Text>

      <SearchBar value={query} onChangeText={setQuery} onSubmit={() => undefined} />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rail}
      >
        <CategoryChip
          category={{ id: 'audio', label: 'All', icon: 'headphones' }}
          active={category === 'all'}
          onPress={() => setCategory('all')}
        />
        {categories.map((entry) => (
          <CategoryChip
            key={entry.id}
            category={entry}
            active={category === entry.id}
            onPress={() => setCategory(entry.id)}
          />
        ))}
      </ScrollView>

      <View style={styles.filterRow}>
        {sortOptions.slice(0, 3).map((option) => {
          const active = sort === option.value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => setSort(option.value)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: inStockOnly }}
          onPress={() => setInStockOnly((value) => !value)}
          style={[styles.chip, inStockOnly && styles.chipActive]}
        >
          <Text style={[styles.chipLabel, inStockOnly && styles.chipLabelActive]}>In stock</Text>
        </Pressable>
      </View>

      <Text style={styles.count}>
        {results.length} {results.length === 1 ? 'product' : 'products'} · sample data
      </Text>

      {results.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No products match those filters</Text>
          <Text style={styles.emptyBody}>
            Nothing in the sample catalogue matches this combination. Clear a filter or try another
            term.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setQuery('');
              setCategory('all');
              setInStockOnly(false);
              navigation.setParams({ query: undefined, category: undefined });
            }}
            style={styles.emptyButton}
          >
            <Text style={styles.emptyButtonLabel}>Clear filters</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.grid}>
          {results.map((product) => (
            <View key={product.id} style={styles.gridItem}>
              <ProductCard
                product={product}
                onPress={(productId) => rootNavigation.navigate('Product', { productId })}
              />
            </View>
          ))}
        </View>
      )}

      <DemoNotice />
    </ScrollView>
  );
}

const buildStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    content: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.xxxl,
      gap: spacing.md,
    },
    heading: { fontSize: fontSizes.xl, fontWeight: '800', color: colors.text, letterSpacing: -0.4 },
    rail: { gap: spacing.xs, paddingRight: spacing.lg },
    filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    chip: {
      paddingHorizontal: spacing.md,
      paddingVertical: 7,
      borderRadius: radii.pill,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    chipActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
    chipLabel: { fontSize: 11, fontWeight: '600', color: colors.textMuted },
    chipLabelActive: { color: colors.primary },
    count: { fontSize: fontSizes.xs, color: colors.textSubtle },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
    gridItem: { width: '48%' },
    empty: {
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.xxl,
      paddingHorizontal: spacing.lg,
      borderRadius: radii.xl,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    emptyTitle: {
      fontSize: fontSizes.md,
      fontWeight: '700',
      color: colors.text,
      textAlign: 'center',
    },
    emptyBody: {
      fontSize: fontSizes.sm,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 20,
    },
    emptyButton: {
      marginTop: spacing.sm,
      paddingHorizontal: spacing.lg,
      height: 40,
      justifyContent: 'center',
      borderRadius: radii.pill,
      backgroundColor: colors.primary,
    },
    emptyButtonLabel: { color: colors.onPrimary, fontWeight: '700', fontSize: fontSizes.sm },
  });
