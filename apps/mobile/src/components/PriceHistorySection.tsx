import { Info, LineChart } from 'lucide-react-native';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';

import {
  DEFAULT_HISTORY_PERIOD,
  type HistoryObservation,
  type HistoryPeriod,
  type HistoryRollup,
  type PriceHistoryResponse,
} from '@smart-shopping/shared';

import { useProductHistory } from '../hooks/useProductHistory';
import { formatMoney, formatRelativeTime, formatShortDate } from '../lib/format';
import { fontSizes, radii, spacing, type ThemeColors } from '../theme';
import { useAppTheme } from '../theme/ThemeProvider';
import { Button } from './Button';

/**
 * Price history on the product screen.
 *
 * Same rules as the web section: chart verified points whenever they exist, keep
 * demo points out of that chart, and never draw a trend from a single
 * observation. The chart is hand-drawn with `react-native-svg` (already a
 * dependency) rather than adding a charting library.
 */

const PERIODS: { readonly value: HistoryPeriod; readonly label: string }[] = [
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: '90d', label: '90d' },
];

const CHART_HEIGHT = 150;

export function PriceHistorySection({ productId }: { readonly productId: string }) {
  const { colors, isDark } = useAppTheme();
  const styles = buildStyles(colors, isDark);
  const [period, setPeriod] = useState<HistoryPeriod>(DEFAULT_HISTORY_PERIOD);
  const { state, retry } = useProductHistory(productId, period);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>Price history</Text>
        <View style={styles.filters}>
          {PERIODS.map((option) => {
            const selected = option.value === period;
            return (
              <Pressable
                key={option.value}
                onPress={() => setPeriod(option.value)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`Show ${option.label} of price history`}
                style={[styles.filter, selected && styles.filterSelected]}
              >
                <Text style={[styles.filterLabel, selected && styles.filterLabelSelected]}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      <Text style={styles.description}>
        Stored observations only. Nothing is interpolated, smoothed or back-filled.
      </Text>

      {state.status === 'loading' && (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.loadingText}>Loading history…</Text>
        </View>
      )}

      {state.status === 'error' && (
        <View style={styles.errorBlock}>
          <Text style={styles.errorText}>{state.message}</Text>
          {state.isNetworkError ? (
            <Text style={styles.hint}>
              Check EXPO_PUBLIC_API_BASE_URL and that the API is running.
            </Text>
          ) : null}
          <Button label="Retry history" onPress={retry} />
          <Text style={styles.hint}>
            No sample history is substituted when the API is unreachable.
          </Text>
        </View>
      )}

      {state.status === 'ready' && <HistoryBody history={state.history} colors={colors} />}
    </View>
  );
}

function HistoryBody({
  history,
  colors,
}: {
  readonly history: PriceHistoryResponse;
  readonly colors: ThemeColors;
}) {
  const { width } = useWindowDimensions();
  const styles = buildStyles(colors, false);
  const chartWidth = Math.max(240, width - spacing.lg * 4);
  const hasObservations = history.observations.length > 0;
  const hasArchived = history.rollups.length > 0;

  if (!hasObservations && !hasArchived) {
    return (
      <View style={styles.empty}>
        <LineChart size={16} color={colors.textSubtle} />
        <Text style={styles.emptyTitle}>No stored observation in this period</Text>
        <Text style={styles.description}>
          History starts when the API reads a price source for this product. Nothing is drawn until
          that has happened.
        </Text>
      </View>
    );
  }

  if (!hasObservations) {
    return (
      <View style={styles.body}>
        <View style={styles.empty}>
          <LineChart size={16} color={colors.textSubtle} />
          <Text style={styles.emptyTitle}>No full-resolution observation in this period</Text>
          <Text style={styles.description}>
            These days were compacted into the daily summaries below. Nothing is reconstructed or
            interpolated from them, so no chart is drawn.
          </Text>
        </View>
        <ArchivedDays rollups={history.rollups} styles={styles} />
      </View>
    );
  }

  const verified = history.observations.filter((observation) => !observation.isSample);
  const sample = history.observations.filter((observation) => observation.isSample);
  const charted: HistoryObservation[] = verified.length > 0 ? verified : sample;
  const chartedIsSample = verified.length === 0;
  const summary = chartedIsSample ? history.summary.sample : history.summary.verified;
  const sources = [...new Set(charted.map((observation) => observation.source.displayName))];

  return (
    <View style={styles.body}>
      <View style={styles.badgeRow}>
        <Text style={[styles.badge, chartedIsSample ? styles.badgeDemo : styles.badgeVerified]}>
          {chartedIsSample ? 'DEMO OBSERVATIONS' : 'VERIFIED OBSERVATIONS'}
        </Text>
        <Text style={styles.periodLabel} numberOfLines={1}>
          {formatShortDate(history.from)} – {formatShortDate(history.to)} · last{' '}
          {periodLabel(history.period)}
        </Text>
      </View>

      <View style={styles.statsRow}>
        <Stat
          styles={styles}
          label={chartedIsSample ? 'Lowest demo' : 'Lowest verified'}
          value={summary.lowest ? formatMoney(summary.lowest.price) : '—'}
          hint={summary.latest ? formatRelativeTime(summary.latest.capturedAt) : undefined}
        />
        <Stat
          styles={styles}
          label="Latest"
          value={summary.latest ? formatMoney(summary.latest.price) : '—'}
          hint={summary.latest ? formatRelativeTime(summary.latest.capturedAt) : undefined}
        />
        <Stat styles={styles} label="Points" value={String(summary.count)} />
      </View>

      <Text style={styles.sourceLine} numberOfLines={2}>
        Source: {sources.join(', ')}
      </Text>

      <HistoryChart
        points={charted}
        width={chartWidth}
        colors={colors}
        label={
          chartedIsSample
            ? `Demo sample price observations over ${periodLabel(history.period)}`
            : `Verified price observations over ${periodLabel(history.period)}`
        }
      />

      {verified.length > 0 && sample.length > 0 && (
        <View style={styles.note}>
          <Info size={13} color={colors.textSubtle} />
          <Text style={styles.noteText}>
            {sample.length} demo observation{sample.length === 1 ? '' : 's'} excluded from this
            chart: invented prices are never plotted as a marketplace trend.
          </Text>
        </View>
      )}

      {chartedIsSample && (
        <View style={styles.note}>
          <Info size={13} color={colors.textSubtle} />
          <Text style={styles.noteText}>
            Invented demo prices from the sample source. Not marketplace history, and not a real
            price trend.
          </Text>
        </View>
      )}

      {hasArchived ? <ArchivedDays rollups={history.rollups} styles={styles} /> : null}
    </View>
  );
}

/**
 * Archived days compacted out of raw storage.
 *
 * A list, not chart points: min/max/first/last describe a whole day, and plotting
 * them on a price axis would imply a time-of-day price nobody observed.
 */
function ArchivedDays({
  rollups,
  styles,
}: {
  readonly rollups: readonly HistoryRollup[];
  readonly styles: ReturnType<typeof buildStyles>;
}) {
  return (
    <View style={styles.archivedCard}>
      <View style={styles.badgeRow}>
        <Text style={styles.archivedTitle}>Archived daily summaries</Text>
        <Text style={[styles.badge, styles.badgeDemo]}>DAILY AGGREGATE</Text>
      </View>
      <Text style={styles.description}>
        One row per marketplace and source per day: min, max, first and last of the stored
        observations. Not point-in-time marketplace prices.
      </Text>

      {rollups.map((rollup) => (
        <View
          key={`${rollup.date}-${rollup.marketplaceId}-${rollup.sourceId}-${String(rollup.isSample)}`}
          style={styles.archivedRow}
        >
          <View style={styles.badgeRow}>
            <Text style={styles.archivedDate}>{formatShortDate(rollup.date)}</Text>
            <Text style={styles.archivedMeta} numberOfLines={1}>
              {rollup.marketplaceId} · {rollup.source.displayName}
            </Text>
            {rollup.isSample ? <Text style={[styles.badge, styles.badgeDemo]}>DEMO</Text> : null}
          </View>
          <Text style={styles.archivedMeta}>
            Min {formatMoney(rollup.minPrice)} · Max {formatMoney(rollup.maxPrice)} · First{' '}
            {formatMoney(rollup.firstPrice)} · Last {formatMoney(rollup.lastPrice)} ·{' '}
            {rollup.observationCount} observation
            {rollup.observationCount === 1 ? '' : 's'}
          </Text>
        </View>
      ))}
    </View>
  );
}

function HistoryChart({
  points,
  width,
  colors,
  label,
}: {
  readonly points: readonly HistoryObservation[];
  readonly width: number;
  readonly colors: ThemeColors;
  readonly label: string;
}) {
  const padding = { top: 14, right: 12, bottom: 22, left: 12 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = CHART_HEIGHT - padding.top - padding.bottom;

  const times = points.map((point) => Date.parse(point.capturedAt));
  const values = points.map((point) => point.price.amountMinor);
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const span = rawMax - rawMin === 0 ? Math.max(1, rawMax * 0.05) : rawMax - rawMin;
  const minValue = rawMin - span * 0.15;
  const maxValue = rawMax + span * 0.15;

  const xFor = (time: number): number =>
    points.length === 1 || maxTime === minTime
      ? padding.left + innerWidth / 2
      : padding.left + ((time - minTime) / (maxTime - minTime)) * innerWidth;
  const yFor = (value: number): number =>
    padding.top + innerHeight - ((value - minValue) / (maxValue - minValue)) * innerHeight;

  const positioned = points.map((point, index) => ({
    x: xFor(times[index] ?? minTime),
    y: yFor(point.price.amountMinor),
    point,
  }));

  const line = positioned
    .map((entry, index) => `${index === 0 ? 'M' : 'L'}${entry.x.toFixed(2)},${entry.y.toFixed(2)}`)
    .join(' ');
  const baseline = padding.top + innerHeight;
  const area =
    positioned.length > 1
      ? `${line} L${positioned[positioned.length - 1]?.x.toFixed(2)},${baseline} L${positioned[0]?.x.toFixed(2)},${baseline} Z`
      : '';

  // Only the observed extremes are labelled, so an axis tick never reads like an
  // invented price.
  const ticks = [
    {
      y: yFor(rawMax),
      label: formatMoney({ amountMinor: rawMax, currency: points[0]?.price.currency ?? 'INR' }),
    },
    { y: yFor((rawMax + rawMin) / 2), label: null },
    {
      y: yFor(rawMin),
      label: formatMoney({ amountMinor: rawMin, currency: points[0]?.price.currency ?? 'INR' }),
    },
  ];
  const spansHours = maxTime - minTime < 48 * 3_600_000;

  return (
    <Svg
      width={width}
      height={CHART_HEIGHT}
      accessible
      accessibilityLabel={`${label}. ${points.length} observation${points.length === 1 ? ', not enough for a trend' : 's'}.`}
    >
      {ticks.map((tick, index) => (
        <Line
          key={`grid-${index}`}
          x1={padding.left}
          x2={width - padding.right}
          y1={tick.y}
          y2={tick.y}
          stroke={colors.border}
          strokeWidth={1}
          strokeDasharray="4 6"
        />
      ))}

      {area ? <Path d={area} fill={colors.primarySoft} /> : null}
      {positioned.length > 1 ? (
        <Path
          d={line}
          fill="none"
          stroke={colors.primary}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}

      {positioned.map((entry) => (
        <Circle
          key={`${entry.point.capturedAt}-${entry.point.price.amountMinor}`}
          cx={entry.x}
          cy={entry.y}
          r={positioned.length === 1 ? 5 : 3.5}
          fill={colors.primary}
          stroke={colors.surface}
          strokeWidth={1.5}
        />
      ))}

      {ticks.map((tick, index) =>
        tick.label ? (
          <SvgText
            key={`tick-${index}`}
            x={padding.left}
            y={tick.y - 4}
            fontSize={9}
            fill={colors.textSubtle}
          >
            {tick.label}
          </SvgText>
        ) : null,
      )}

      <SvgText x={padding.left} y={CHART_HEIGHT - 6} fontSize={9} fill={colors.textSubtle}>
        {axisLabel(points[0]?.capturedAt ?? '', spansHours)}
      </SvgText>
      {positioned.length > 1 ? (
        <SvgText
          x={width - padding.right}
          y={CHART_HEIGHT - 6}
          fontSize={9}
          fill={colors.textSubtle}
          textAnchor="end"
        >
          {axisLabel(points[points.length - 1]?.capturedAt ?? '', spansHours)}
        </SvgText>
      ) : null}
    </Svg>
  );
}

function Stat({
  styles,
  label,
  value,
  hint,
}: {
  readonly styles: ReturnType<typeof buildStyles>;
  readonly label: string;
  readonly value: string;
  readonly hint?: string;
}) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
      {hint ? <Text style={styles.statHint}>{hint}</Text> : null}
    </View>
  );
}

/** Short date, plus the clock time when the window is under two days. */
function axisLabel(iso: string, withTime: boolean): string {
  const timestamp = Date.parse(iso);
  if (Number.isNaN(timestamp)) return '—';
  if (!withTime) return formatShortDate(iso);

  try {
    return new Intl.DateTimeFormat('en-IN', {
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
    }).format(timestamp);
  } catch {
    return formatShortDate(iso);
  }
}

function periodLabel(period: HistoryPeriod): string {
  switch (period) {
    case '7d':
      return '7 days';
    case '30d':
      return '30 days';
    case '90d':
      return '90 days';
  }
}

/** Kept separate so the chart and the surrounding copy share one palette. */
function buildStyles(colors: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: radii.lg,
      borderWidth: 1,
      padding: spacing.lg,
      gap: spacing.sm,
    },
    header: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    title: {
      color: colors.text,
      fontSize: fontSizes.md,
      fontWeight: '600',
    },
    filters: { flexDirection: 'row', gap: spacing.xs },
    filter: {
      borderColor: colors.border,
      borderRadius: radii.pill,
      borderWidth: 1,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
    },
    filterSelected: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    filterLabel: { color: colors.textMuted, fontSize: fontSizes.xs, fontWeight: '600' },
    filterLabelSelected: { color: colors.onPrimary },
    description: { color: colors.textMuted, fontSize: fontSizes.xs, lineHeight: 18 },
    loadingRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: spacing.sm,
      paddingVertical: spacing.md,
    },
    loadingText: { color: colors.textMuted, fontSize: fontSizes.sm },
    errorBlock: { gap: spacing.sm, paddingVertical: spacing.sm },
    errorText: { color: colors.danger, fontSize: fontSizes.sm },
    hint: { color: colors.textSubtle, fontSize: fontSizes.xs },
    empty: { gap: spacing.xs, paddingVertical: spacing.sm },
    emptyTitle: { color: colors.text, fontSize: fontSizes.sm, fontWeight: '600' },
    body: { gap: spacing.sm, paddingTop: spacing.xs },
    badgeRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    badge: {
      borderRadius: radii.pill,
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 0.6,
      overflow: 'hidden',
      paddingHorizontal: spacing.sm,
      paddingVertical: 3,
    },
    badgeDemo: { backgroundColor: colors.surfaceMuted, color: colors.textMuted },
    badgeVerified: { backgroundColor: colors.primarySoft, color: colors.success },
    periodLabel: { color: colors.textSubtle, flexShrink: 1, fontSize: 11 },
    statsRow: { flexDirection: 'row', gap: spacing.sm },
    stat: {
      backgroundColor: isDark ? colors.surfaceMuted : colors.background,
      borderColor: colors.border,
      borderRadius: radii.md,
      borderWidth: 1,
      flex: 1,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.sm,
    },
    statLabel: { color: colors.textSubtle, fontSize: 10, textTransform: 'uppercase' },
    statValue: { color: colors.text, fontSize: fontSizes.sm, fontWeight: '700' },
    statHint: { color: colors.textSubtle, fontSize: 10 },
    sourceLine: { color: colors.textSubtle, fontSize: 11 },
    archivedCard: {
      backgroundColor: isDark ? colors.surfaceMuted : colors.background,
      borderColor: colors.border,
      borderRadius: radii.md,
      borderWidth: 1,
      gap: spacing.xs,
      marginTop: spacing.xs,
      padding: spacing.md,
    },
    archivedTitle: { color: colors.text, flexShrink: 1, fontSize: fontSizes.sm, fontWeight: '600' },
    archivedRow: {
      borderColor: colors.border,
      borderRadius: radii.sm,
      borderWidth: 1,
      gap: 2,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
    },
    archivedDate: { color: colors.text, fontSize: fontSizes.xs, fontWeight: '600' },
    archivedMeta: { color: colors.textSubtle, flexShrink: 1, fontSize: 10, lineHeight: 15 },
    note: { flexDirection: 'row', gap: spacing.xs, paddingTop: spacing.xxs },
    noteText: { color: colors.textSubtle, flex: 1, fontSize: 11, lineHeight: 16 },
  });
}
