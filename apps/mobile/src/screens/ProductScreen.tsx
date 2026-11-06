import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  Camera,
  Check,
  Clock3,
  Headphones,
  Info,
  Laptop,
  Shirt,
  Smartphone,
  Store,
  Watch,
  Footprints,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  availableMarketplaceCount,
  categoryById,
  demoProducts,
  lowestOffer,
  marketplaceById,
  rankedOffers,
  savingsAgainstList,
} from '@smart-shopping/shared';

import { Button } from '../components/Button';
import { DemoNotice } from '../components/DemoNotice';
import { formatMoney, formatRelativeTime } from '../lib/format';
import type { RootStackParamList } from '../navigation/types';
import { fontSizes, radii, spacing, type ThemeColors } from '../theme';
import { useAppTheme } from '../theme/ThemeProvider';

type Props = NativeStackScreenProps<RootStackParamList, 'Product'>;

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

/** Product comparison: cheapest in-stock offer first, stock and time always shown. */
export function ProductScreen({ route, navigation }: Props) {
  const { colors, isDark } = useAppTheme();
  const styles = buildStyles(colors, isDark);

  const product = demoProducts.find((entry) => entry.id === route.params.productId);

  if (!product) {
    return (
      <View style={styles.missing}>
        <Text style={styles.missingTitle}>Product not found</Text>
        <Text style={styles.missingBody}>It is no longer in the sample catalogue.</Text>
        <Button label="Back to results" onPress={() => navigation.goBack()} />
      </View>
    );
  }

  const offers = rankedOffers(product);
  const best = lowestOffer(product);
  const Icon = iconFor(product.icon);
  const category = categoryById(product.category);
  const savingPercent = Math.round(
    (savingsAgainstList(product) / product.listPrice.amountMinor) * 100,
  );

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.artwork}>
        <Icon size={96} color={isDark ? colors.textSubtle : '#334155'} strokeWidth={0.9} />
        <Text style={styles.artworkNote}>Placeholder artwork</Text>
      </View>

      <View style={styles.titleBlock}>
        <Text style={styles.brand}>
          {product.brand}
          {category ? ` · ${category.label}` : ''}
        </Text>
        <Text style={styles.title}>{product.title}</Text>
        <Text style={styles.meta}>
          ★ {product.rating.toFixed(1)} · {availableMarketplaceCount(product)} marketplaces ·{' '}
          {savingPercent}% best saving
        </Text>
      </View>

      <View style={styles.priceCard}>
        <Text style={styles.priceLabel}>Lowest in-stock price</Text>
        {best ? (
          <>
            <Text style={styles.price}>{formatMoney(best.price)}</Text>
            <Text style={styles.priceMeta}>
              {marketplaceById(best.marketplaceId)?.name} · observed{' '}
              {formatRelativeTime(best.observedAt)}
            </Text>
          </>
        ) : (
          <Text style={styles.unavailable}>Currently unavailable</Text>
        )}
        <Button label="Track price" disabled block onPress={() => undefined} />
        <Text style={styles.hint}>
          Tracking needs an account, and authentication is not implemented in this build.
        </Text>
      </View>

      <Text style={styles.sectionTitle}>Marketplace comparison</Text>
      <View style={styles.offers}>
        {offers.map((offer) => {
          const marketplace = marketplaceById(offer.marketplaceId);
          const isLowest = offer.marketplaceId === best?.marketplaceId;

          return (
            <View key={offer.marketplaceId} style={[styles.offer, isLowest && styles.offerLowest]}>
              <View
                style={[
                  styles.offerTile,
                  { backgroundColor: marketplace?.accent ?? colors.primary },
                ]}
              >
                <Text style={styles.offerInitial}>{marketplace?.short ?? '?'}</Text>
              </View>

              <View style={styles.offerCopy}>
                <View style={styles.offerTitleRow}>
                  <Text style={styles.offerName} numberOfLines={1}>
                    {marketplace?.name}
                  </Text>
                  {isLowest ? (
                    <View style={styles.lowestBadge}>
                      <Text style={styles.lowestText}>LOWEST</Text>
                    </View>
                  ) : null}
                </View>
                <View style={styles.offerMetaRow}>
                  <Clock3 size={10} color={colors.textSubtle} />
                  <Text style={styles.offerMeta}>
                    {formatRelativeTime(offer.observedAt)}
                    {offer.inStock ? '' : ' · out of stock'}
                  </Text>
                </View>
              </View>

              <Text style={[styles.offerPrice, isLowest && styles.offerPriceLowest]}>
                {formatMoney(offer.price)}
              </Text>
            </View>
          );
        })}
      </View>

      <View style={styles.note}>
        <Info size={13} color={colors.textSubtle} />
        <Text style={styles.noteText}>
          Deal buttons are disabled: no marketplace integration or affiliate link is authorised yet.
        </Text>
      </View>

      <Text style={styles.sectionTitle}>Highlights</Text>
      <View style={styles.highlights}>
        {product.highlights.map((highlight) => (
          <View key={highlight} style={styles.highlightRow}>
            <Check size={14} color={colors.primary} />
            <Text style={styles.highlight}>{highlight}</Text>
          </View>
        ))}
      </View>

      <View style={styles.historyCard}>
        <Text style={styles.historyTitle}>Price history is not available yet</Text>
        <Text style={styles.historyBody}>
          A trend chart needs real observation snapshots. This build stores none, so it shows none.
        </Text>
      </View>

      <DemoNotice />
    </ScrollView>
  );
}

const buildStyles = (colors: ThemeColors, isDark: boolean) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    content: {
      padding: spacing.lg,
      paddingBottom: spacing.xxxl,
      gap: spacing.lg,
    },
    missing: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.md,
      padding: spacing.xl,
      backgroundColor: colors.background,
    },
    missingTitle: { fontSize: fontSizes.lg, fontWeight: '700', color: colors.text },
    missingBody: { fontSize: fontSizes.sm, color: colors.textMuted, textAlign: 'center' },
    artwork: {
      height: 220,
      borderRadius: radii.xl,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      backgroundColor: isDark ? colors.surfaceMuted : '#e2e8f0',
    },
    artworkNote: { fontSize: 10, letterSpacing: 1, fontWeight: '700', color: colors.textSubtle },
    titleBlock: { gap: 4 },
    brand: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, color: colors.textSubtle },
    title: { fontSize: fontSizes.xl, fontWeight: '800', color: colors.text, lineHeight: 27 },
    meta: { fontSize: fontSizes.xs, color: colors.textMuted },
    priceCard: {
      gap: spacing.sm,
      padding: spacing.lg,
      borderRadius: radii.xl,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    priceLabel: { fontSize: fontSizes.xs, color: colors.textSubtle },
    price: { fontSize: 34, fontWeight: '800', letterSpacing: -1, color: colors.primary },
    priceMeta: { fontSize: fontSizes.xs, color: colors.textMuted },
    unavailable: { fontSize: fontSizes.md, fontWeight: '700', color: colors.textMuted },
    hint: { fontSize: 10, color: colors.textSubtle, lineHeight: 15 },
    sectionTitle: { fontSize: fontSizes.md, fontWeight: '700', color: colors.text },
    offers: { gap: spacing.sm },
    offer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      padding: spacing.md,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    offerLowest: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
    offerTile: {
      width: 36,
      height: 36,
      borderRadius: radii.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    offerInitial: { color: '#ffffff', fontWeight: '700', fontSize: fontSizes.sm },
    offerCopy: { flex: 1, gap: 2 },
    offerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    offerName: { fontSize: fontSizes.sm, fontWeight: '600', color: colors.text, flexShrink: 1 },
    lowestBadge: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: radii.pill,
      backgroundColor: colors.primary,
    },
    lowestText: { fontSize: 8, fontWeight: '800', letterSpacing: 0.6, color: colors.onPrimary },
    offerMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    offerMeta: { fontSize: 10, color: colors.textMuted },
    offerPrice: { fontSize: fontSizes.md, fontWeight: '700', color: colors.text },
    offerPriceLowest: { color: colors.primary },
    note: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      padding: spacing.md,
      borderRadius: radii.md,
      backgroundColor: colors.surfaceMuted,
    },
    noteText: { flex: 1, fontSize: 11, lineHeight: 16, color: colors.textMuted },
    highlights: { gap: spacing.sm },
    highlightRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
    highlight: { flex: 1, fontSize: fontSizes.sm, color: colors.textMuted, lineHeight: 19 },
    historyCard: {
      gap: 4,
      padding: spacing.lg,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: colors.borderStrong,
    },
    historyTitle: { fontSize: fontSizes.sm, fontWeight: '700', color: colors.text },
    historyBody: { fontSize: fontSizes.xs, color: colors.textMuted, lineHeight: 18 },
  });
