import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  Camera,
  Check,
  Clock3,
  Footprints,
  Headphones,
  Info,
  Laptop,
  ShieldCheck,
  Shirt,
  Smartphone,
  Store,
  Watch,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { availableMarketplaceCount, categoryById, demoProducts } from '@smart-shopping/shared';

import { Button } from '../components/Button';
import { DemoNotice } from '../components/DemoNotice';
import { PriceHistorySection } from '../components/PriceHistorySection';
import { ProductIdentitySection } from '../components/ProductIdentitySection';
import { useProductComparison } from '../hooks/useProductComparison';
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

/**
 * Product comparison on mobile.
 *
 * Product identity comes from the shared catalogue, prices come from the
 * comparison API. The screen states which source produced each number, when it
 * was observed, and labels sample data as demo - it never promotes sample prices
 * to "verified".
 */
export function ProductScreen({ route, navigation }: Props) {
  const { colors, isDark } = useAppTheme();
  const styles = buildStyles(colors, isDark);
  const { state, retry } = useProductComparison(route.params.productId);

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

  const Icon = iconFor(product.icon);
  const category = categoryById(product.category);
  const comparison = state.status === 'ready' ? state.comparison : null;
  const lowest = comparison?.lowest ?? null;

  const lowestLabel =
    comparison?.status === 'verified'
      ? 'Lowest verified price'
      : comparison?.status === 'sample_only'
        ? 'Lowest sample price'
        : 'Lowest eligible price';

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
          ★ {product.rating.toFixed(1)} · {availableMarketplaceCount(product)} marketplaces
          {comparison ? ` · ${comparison.offers.length} ranked now` : ''}
        </Text>
      </View>

      <View style={styles.priceCard}>
        {state.status === 'loading' && (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.loadingText}>Loading comparison…</Text>
          </View>
        )}

        {state.status === 'error' && (
          <View style={styles.errorBlock}>
            <Text style={styles.priceLabel}>Comparison unavailable</Text>
            <Text style={styles.errorText}>{state.message}</Text>
            {state.isNetworkError ? (
              <Text style={styles.hint}>
                Check EXPO_PUBLIC_API_BASE_URL and that the API is running.
              </Text>
            ) : null}
            <Button label="Retry" onPress={retry} />
            <Text style={styles.hint}>
              No fallback prices: a comparison must come from the comparison engine.
            </Text>
          </View>
        )}

        {comparison && (
          <>
            <Text style={styles.priceLabel}>{lowestLabel}</Text>
            {lowest ? (
              <>
                <Text style={styles.price}>{formatMoney(lowest.price)}</Text>
                <Text style={styles.priceMeta}>
                  {lowest.source.verification === 'sample' ? 'DEMO · ' : ''}
                  {lowest.source.displayName} · observed {formatRelativeTime(lowest.capturedAt)}
                </Text>
              </>
            ) : (
              <Text style={styles.unavailable}>Currently unavailable</Text>
            )}
            <Button label="Track price" disabled block onPress={() => undefined} />
            <Text style={styles.hint}>
              Alerts stay disabled until a source permits them and accounts exist.
            </Text>
          </>
        )}
      </View>

      <Text style={styles.sectionTitle}>Marketplace comparison</Text>

      {state.status === 'loading' && <Text style={styles.loadingText}>Loading offers…</Text>}

      {state.status === 'error' && (
        <View style={styles.noticeCard}>
          <Text style={styles.noticeText}>
            Offers cannot be shown while the comparison API is unreachable.
          </Text>
        </View>
      )}

      {comparison && (
        <>
          <View style={styles.offers}>
            {comparison.offers.length === 0 && (
              <View style={styles.noticeCard}>
                <Text style={styles.noticeText}>
                  No eligible observation: every offer was stale, out of stock, or from a source
                  without permission.
                </Text>
              </View>
            )}

            {comparison.offers.map((offer) => (
              <View
                key={`${offer.marketplaceId}-${offer.capturedAt}`}
                style={[styles.offer, offer.isLowest && styles.offerLowest]}
                accessibilityLabel={`${offer.marketplaceId} ${formatMoney(offer.price)}${
                  offer.isLowest ? ', lowest' : ''
                }`}
              >
                <View style={styles.offerCopy}>
                  <View style={styles.offerTitleRow}>
                    <Text style={styles.offerName} numberOfLines={1}>
                      {offer.marketplaceId}
                    </Text>
                    {offer.isLowest ? (
                      <View style={styles.lowestBadge}>
                        <Text style={styles.lowestText}>LOWEST</Text>
                      </View>
                    ) : null}
                    {offer.source.verification === 'sample' ? (
                      <View style={styles.demoBadge}>
                        <Text style={styles.demoText}>DEMO</Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={styles.offerMetaRow}>
                    <Clock3 size={10} color={colors.textSubtle} />
                    <Text style={styles.offerMeta} numberOfLines={1}>
                      {formatRelativeTime(offer.capturedAt)} · {offer.source.displayName}
                    </Text>
                  </View>
                  <Text style={styles.offerAttribution} numberOfLines={1}>
                    {offer.attribution.label}
                  </Text>
                </View>

                <Text style={[styles.offerPrice, offer.isLowest && styles.offerPriceLowest]}>
                  {formatMoney(offer.price)}
                </Text>
              </View>
            ))}
          </View>

          {comparison.excluded.length > 0 && (
            <Text style={styles.excluded}>
              Not ranked: {comparison.excluded.length}{' '}
              {comparison.excluded.length === 1 ? 'observation' : 'observations'} (stale, out of
              stock, wrong currency or invalid)
            </Text>
          )}

          <View style={styles.coverageCard}>
            <Text style={styles.coverageTitle}>Source coverage</Text>
            {comparison.sources.map((source) => (
              <View key={source.id} style={styles.coverageRow}>
                <Text style={styles.coverageName} numberOfLines={1}>
                  {source.displayName}
                </Text>
                <Text style={[styles.coverageStatus, source.enabled && styles.coverageEnabled]}>
                  {source.enabled ? 'Enabled' : 'Pending permission'}
                </Text>
              </View>
            ))}
            {comparison.notices.map((notice) => (
              <Text key={notice} style={styles.coverageNotice}>
                {notice}
              </Text>
            ))}
          </View>

          <View style={styles.note}>
            <ShieldCheck size={13} color={colors.textSubtle} />
            <Text style={styles.noteText}>
              Every price carries its source and observation time. Verified means an authorised
              source, not a cheaper number.
            </Text>
          </View>
        </>
      )}

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

      <PriceHistorySection productId={product.id} />

      <ProductIdentitySection productId={product.id} />

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
    loadingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    loadingText: { fontSize: fontSizes.sm, color: colors.textMuted },
    errorBlock: { gap: spacing.sm },
    errorText: { fontSize: fontSizes.sm, color: colors.danger },
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
    demoBadge: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: radii.pill,
      borderWidth: 1,
      borderColor: colors.borderStrong,
    },
    demoText: { fontSize: 8, fontWeight: '800', letterSpacing: 0.6, color: colors.textSubtle },
    offerMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    offerMeta: { fontSize: 10, color: colors.textMuted, flexShrink: 1 },
    offerAttribution: { fontSize: 9, color: colors.textSubtle },
    offerPrice: { fontSize: fontSizes.md, fontWeight: '700', color: colors.text },
    offerPriceLowest: { color: colors.primary },
    excluded: { fontSize: 10, color: colors.textSubtle, lineHeight: 15 },
    coverageCard: {
      gap: 6,
      padding: spacing.md,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    coverageTitle: { fontSize: fontSizes.sm, fontWeight: '700', color: colors.text },
    coverageRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    coverageName: { fontSize: 11, color: colors.textMuted, flexShrink: 1 },
    coverageStatus: { fontSize: 10, fontWeight: '700', color: colors.textSubtle },
    coverageEnabled: { color: colors.success },
    coverageNotice: { fontSize: 9, color: colors.textSubtle, lineHeight: 14 },
    noticeCard: {
      padding: spacing.md,
      borderRadius: radii.md,
      backgroundColor: colors.surfaceMuted,
    },
    noticeText: { fontSize: 11, lineHeight: 16, color: colors.textMuted },
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
  });
