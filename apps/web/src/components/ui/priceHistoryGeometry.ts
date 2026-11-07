import type { Money } from '@smart-shopping/shared';

import { formatMoney, formatShortDate } from '../../lib/format';

/**
 * Pure geometry for the price history chart.
 *
 * Separated from the component so `PriceHistoryChart.tsx` exports a component
 * only (fast refresh) and the maths is testable without a DOM.
 */

export interface PriceHistoryPoint {
  readonly capturedAt: string;
  readonly price: Money;
}

export const CHART_WIDTH = 640;
export const CHART_HEIGHT = 200;
export const CHART_PADDING = { top: 18, right: 16, bottom: 26, left: 16 };

export interface ChartGeometry {
  readonly points: { x: number; y: number; point: PriceHistoryPoint }[];
  readonly line: string;
  readonly area: string;
  /** Grid lines only; only the observed extremes carry a label. */
  readonly ticks: { y: number; label: string | null }[];
  readonly firstDate: string;
  readonly lastDate: string;
}

export function buildChartGeometry(
  points: readonly PriceHistoryPoint[],
  width = CHART_WIDTH,
  height = CHART_HEIGHT,
): ChartGeometry {
  const innerWidth = width - CHART_PADDING.left - CHART_PADDING.right;
  const innerHeight = height - CHART_PADDING.top - CHART_PADDING.bottom;

  const times = points.map((point) => Date.parse(point.capturedAt));
  const values = points.map((point) => point.price.amountMinor);

  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  // Keep a flat series readable instead of dividing by zero.
  const span = rawMax - rawMin === 0 ? Math.max(1, rawMax * 0.05) : rawMax - rawMin;
  const minValue = rawMin - span * 0.15;
  const maxValue = rawMax + span * 0.15;

  const xFor = (time: number): number => {
    if (points.length === 1 || maxTime === minTime) {
      return CHART_PADDING.left + innerWidth / 2;
    }
    return CHART_PADDING.left + ((time - minTime) / (maxTime - minTime)) * innerWidth;
  };

  const yFor = (value: number): number =>
    CHART_PADDING.top + innerHeight - ((value - minValue) / (maxValue - minValue)) * innerHeight;

  const positioned = points.map((point, index) => ({
    x: xFor(times[index] ?? minTime),
    y: yFor(point.price.amountMinor),
    point,
  }));

  const line = positioned
    .map((entry, index) => `${index === 0 ? 'M' : 'L'}${entry.x.toFixed(2)},${entry.y.toFixed(2)}`)
    .join(' ');

  const baseline = CHART_PADDING.top + innerHeight;
  const area =
    positioned.length > 1
      ? `${line} L${positioned[positioned.length - 1]?.x.toFixed(2)},${baseline} L${positioned[0]?.x.toFixed(2)},${baseline} Z`
      : '';

  // Labels mark the highest and lowest *observed* prices, never a padded scale
  // value: an axis tick that reads like a price must correspond to stored data.
  const ticks: { y: number; label: string | null }[] = [
    { y: yFor(rawMax), label: formatMoney({ amountMinor: rawMax, currency: 'INR' }) },
    { y: yFor((rawMax + rawMin) / 2), label: null },
    { y: yFor(rawMin), label: formatMoney({ amountMinor: rawMin, currency: 'INR' }) },
  ];

  const spansHours = maxTime - minTime < 48 * 3_600_000;

  return {
    points: positioned,
    line,
    area,
    ticks,
    firstDate: axisLabel(points[0]?.capturedAt ?? '', spansHours),
    lastDate: axisLabel(points[points.length - 1]?.capturedAt ?? '', spansHours),
  };
}

/** Short date, plus the clock time when the window is under two days. */
export function axisLabel(iso: string, withTime: boolean): string {
  const timestamp = Date.parse(iso);
  if (Number.isNaN(timestamp)) return '—';
  if (!withTime) return formatShortDate(iso);

  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(timestamp);
}
