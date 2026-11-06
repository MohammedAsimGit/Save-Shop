import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BellRing, Mail, Smartphone, Target } from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  availableMarketplaceCount,
  demoProducts,
  lowestOffer,
  type DemoProduct,
  type Money,
} from '@smart-shopping/shared';

import { Card } from '../components/Card';
import { DemoNotice } from '../components/DemoNotice';
import { StatusPill } from '../components/StatusPill';
import { useApiHealth } from '../hooks/useApiHealth';
import { formatMoney } from '../lib/format';
import { mobileEnv } from '../config/env';
import { cardShadow, fontSizes, radii, spacing, type StatusTone, type ThemeColors } from '../theme';
import { useAppTheme } from '../theme/ThemeProvider';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { RootStackParamList, TabParamList } from '../navigation/types';

type Props = BottomTabScreenProps<TabParamList, 'Tracking'>;

/** Deterministic sample targets so the screen is stable between launches. */
const SAMPLE_WATCHLIST = [
  { productId: 'sony-wh1000xm5', targetFactor: 0.92 },
  { productId: 'nike-pegasus-40', targetFactor: 0.9 },
  { productId: 'iphone-15-128', targetFactor: 1.02 },
] as const;

function targetFor(product: DemoProduct, factor: number): Money {
  const lowest = lowestOffer(product);
  const base = lowest?.price.amountMinor ?? product.listPrice.amountMinor;
  return { amountMinor: Math.round((base * factor) / 100) * 100, currency: 'INR' };
}

/**
 * Tracking screen: a labelled sample watchlist plus the live API health check.
 *
 * Alerts need accounts and real price snapshots; neither exists, so the list is
 * presented as a preview of the intended screen instead of a live watchlist.
 */
export function TrackingScreen({ navigation }: Props) {
  const rootNavigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { colors, isDark } = useAppTheme();
  const styles = buildStyles(colors, isDark);
  const { state, retry } = useApiHealth();

  const watchlist = SAMPLE_WATCHLIST.flatMap(({ productId, targetFactor }) => {
    const product = demoProducts.find((candidate) => candidate.id === productId);
    const lowest = product ? lowestOffer(product) : undefined;
    if (!product || !lowest) return [];
    const target = targetFor(product, targetFactor);
    return [{ product, lowest, target, met: lowest.price.amountMinor <= target.amountMinor }];
  });

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.intro}>
        <Text style={styles.heading}>Price tracking</Text>
        <Text style={styles.lede}>
          Follow a product and get told when it drops below your target. The list below previews the
          intended screen; nothing is saved or monitored in this build.
        </Text>
      </View>

      <DemoNotice />

      <View style={styles.watchlistCard}>
        <View style={styles.watchlistHeader}>
          <Text style={styles.sectionTitle}>Sample watchlist</Text>
          <View style={styles.previewBadge}>
            <Text style={styles.previewBadgeText}>PREVIEW</Text>
          </View>
        </View>
        {watchlist.map(({ product, lowest, target, met }, index) => (
          <Pressable
            key={product.id}
            accessibilityRole="button"
            accessibilityLabel={`${product.title}, ${formatMoney(lowest.price)}, ${
              met ? 'below' : 'above'
            } target ${formatMoney(target)}`}
            onPress={() => rootNavigation.navigate('Product', { productId: product.id })}
            style={({ pressed }) => [
              styles.watchlistRow,
              index > 0 && styles.watchlistRowDivided,
              pressed && styles.rowPressed,
            ]}
          >
            <View style={styles.watchlistCopy}>
              <Text style={styles.watchlistBrand}>{product.brand}</Text>
              <Text style={styles.watchlistTitle} numberOfLines={2}>
                {product.title}
              </Text>
              <Text style={styles.watchlistMeta}>
                Cheapest of {availableMarketplaceCount(product)} marketplaces
              </Text>
            </View>
            <View style={styles.watchlistPrices}>
              <Text style={[styles.watchlistPrice, met && styles.watchlistPriceMet]}>
                {formatMoney(lowest.price)}
              </Text>
              <View style={styles.targetRow}>
                <Target size={11} color={colors.textSubtle} />
                <Text style={styles.targetText}>Target {formatMoney(target)}</Text>
              </View>
              <StatusPill
                tone={met ? 'ok' : 'neutral'}
                label={met ? 'Below target' : 'Above target'}
              />
            </View>
          </Pressable>
        ))}
        <Text style={styles.watchlistFootnote}>
          Targets are invented for this preview. Alerts need an account and a price-snapshot
          pipeline.
        </Text>
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={() => navigation.navigate('Search', undefined)}
        style={styles.browseButton}
      >
        <Text style={styles.browseLabel}>Browse products</Text>
      </Pressable>

      <Card title="Monitoring service">
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Backend API</Text>
          <StatusPill tone={toneFor(state)} label={labelFor(state)} />
        </View>
        <Text style={styles.mono}>{mobileEnv.apiBaseUrl}</Text>
        {state.status === 'ready' ? (
          <Text style={styles.meta}>Database: {state.health.checks.database.status}</Text>
        ) : null}
        {state.status === 'error' ? <Text style={styles.error}>{state.message}</Text> : null}
        <Pressable accessibilityRole="button" onPress={retry} style={styles.recheck}>
          <Text style={styles.recheckLabel}>Re-check</Text>
        </Pressable>
      </Card>

      <Text style={styles.sectionTitle}>What tracking will do</Text>
      <View style={styles.planned}>
        {[
          {
            icon: BellRing,
            title: 'Target price',
            body: 'Set the amount you will pay for one product.',
          },
          {
            icon: Mail,
            title: 'One clear alert',
            body: 'A notification with the verified price and its time.',
          },
          {
            icon: Smartphone,
            title: 'In step',
            body: 'Alerts live on the account, so web and mobile agree.',
          },
        ].map(({ icon: Icon, title, body }) => (
          <View key={title} style={styles.plannedRow}>
            <Icon size={16} color={colors.primary} />
            <View style={styles.plannedCopy}>
              <Text style={styles.plannedTitle}>{title}</Text>
              <Text style={styles.plannedBody}>{body}</Text>
            </View>
          </View>
        ))}
      </View>
      <Text style={styles.footnote}>
        Notification channels (email or push) are still undecided and nothing is scheduled.
      </Text>
    </ScrollView>
  );
}

function toneFor(state: ReturnType<typeof useApiHealth>['state']): StatusTone {
  if (state.status === 'loading') return 'neutral';
  if (state.status === 'error') return 'error';
  return state.health.status === 'ok' ? 'ok' : 'warn';
}

function labelFor(state: ReturnType<typeof useApiHealth>['state']): string {
  if (state.status === 'loading') return 'Checking...';
  if (state.status === 'error') return 'Unreachable';
  return state.health.status === 'ok' ? 'Healthy' : 'Degraded';
}

const buildStyles = (colors: ThemeColors, isDark: boolean) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    content: { padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.lg },
    intro: { gap: 4 },
    heading: {
      fontSize: fontSizes.xxl,
      fontWeight: '800',
      color: colors.text,
      letterSpacing: -0.5,
    },
    lede: { fontSize: fontSizes.sm, color: colors.textMuted, lineHeight: 20 },
    watchlistCard: {
      borderRadius: radii.xl,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      overflow: 'hidden',
      ...cardShadow(isDark),
    },
    watchlistHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
      paddingBottom: spacing.sm,
    },
    previewBadge: {
      paddingHorizontal: spacing.sm,
      paddingVertical: 3,
      borderRadius: radii.pill,
      borderWidth: 1,
      borderColor: colors.border,
    },
    previewBadgeText: {
      fontSize: 9,
      fontWeight: '700',
      letterSpacing: 0.8,
      color: colors.textMuted,
    },
    watchlistRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    watchlistRowDivided: { borderTopWidth: 1, borderTopColor: colors.border },
    rowPressed: { opacity: 0.9 },
    watchlistCopy: { flex: 1, gap: 1 },
    watchlistBrand: {
      fontSize: 9,
      fontWeight: '700',
      letterSpacing: 0.9,
      color: colors.textSubtle,
      textTransform: 'uppercase',
    },
    watchlistTitle: {
      fontSize: fontSizes.sm,
      fontWeight: '600',
      color: colors.text,
      lineHeight: 18,
    },
    watchlistMeta: { fontSize: 10, color: colors.textSubtle, marginTop: 2 },
    watchlistPrices: { alignItems: 'flex-end', gap: 2 },
    watchlistPrice: { fontSize: fontSizes.md, fontWeight: '800', color: colors.text },
    watchlistPriceMet: { color: colors.primary },
    targetRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    targetText: { fontSize: 10, color: colors.textMuted },
    watchlistFootnote: {
      fontSize: 10,
      color: colors.textSubtle,
      lineHeight: 15,
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.lg,
      paddingTop: spacing.sm,
    },
    browseButton: {
      height: 46,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radii.pill,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    browseLabel: { fontSize: fontSizes.sm, fontWeight: '600', color: colors.text },
    statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    statusLabel: { fontSize: fontSizes.sm, fontWeight: '600', color: colors.text },
    mono: { fontSize: 11, color: colors.textMuted, fontFamily: 'monospace' },
    meta: { fontSize: fontSizes.xs, color: colors.textMuted },
    error: { fontSize: fontSizes.xs, color: colors.danger },
    recheck: {
      alignSelf: 'flex-start',
      marginTop: spacing.xs,
      paddingHorizontal: spacing.lg,
      height: 36,
      justifyContent: 'center',
      borderRadius: radii.pill,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: isDark ? colors.surfaceMuted : colors.surface,
    },
    recheckLabel: { fontSize: fontSizes.xs, fontWeight: '600', color: colors.text },
    sectionTitle: { fontSize: fontSizes.md, fontWeight: '700', color: colors.text },
    planned: { gap: spacing.md },
    plannedRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
    plannedCopy: { flex: 1, gap: 1 },
    plannedTitle: { fontSize: fontSizes.sm, fontWeight: '600', color: colors.text },
    plannedBody: { fontSize: fontSizes.xs, color: colors.textMuted, lineHeight: 17 },
    footnote: { fontSize: 10, color: colors.textSubtle },
  });
