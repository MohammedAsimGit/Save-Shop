import { useId } from 'react';

import { formatMoney, formatShortDate } from '../../lib/format';
import {
  buildChartGeometry,
  CHART_HEIGHT,
  CHART_PADDING,
  CHART_WIDTH,
  type PriceHistoryPoint,
} from './priceHistoryGeometry';

/**
 * Price history chart.
 *
 * Hand-rolled SVG on purpose: the project's only charting need is a single series
 * of money values, and adding a charting dependency (plus its bundle, theming and
 * accessibility gaps) for that is not justified. Nothing here invents data - the
 * points are exactly the stored observations the API returned.
 *
 * A single observation is drawn as a dot with a baseline, never as a line: one
 * price is a fact, not a trend.
 */
export function PriceHistoryChart({
  points,
  label,
}: {
  readonly points: readonly PriceHistoryPoint[];
  /** Describes what is plotted, e.g. "Demo sample observations, 30 days". */
  readonly label: string;
}) {
  const gradientId = useId();

  if (points.length === 0) return null;

  const geometry = buildChartGeometry(points);
  const currency = points[0]?.price.currency ?? 'INR';
  const single = points.length === 1;

  return (
    <figure className="mt-3">
      <svg
        role="img"
        aria-label={`${label}. ${points.length} observation${single ? '' : 's'}${
          single ? ', not enough for a trend' : ''
        }.`}
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        className="h-44 w-full text-brand-dark dark:text-brand"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {geometry.ticks.map((tick) => (
          <g key={tick.y.toFixed(2)}>
            <line
              x1={CHART_PADDING.left}
              x2={CHART_WIDTH - CHART_PADDING.right}
              y1={tick.y}
              y2={tick.y}
              className="stroke-line"
              strokeDasharray="4 6"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
            {tick.label && (
              <text
                x={CHART_PADDING.left}
                y={tick.y - 5}
                className="fill-ink-subtle"
                style={{ fontSize: 10 }}
              >
                {tick.label}
              </text>
            )}
          </g>
        ))}

        {geometry.area && <path d={geometry.area} fill={`url(#${gradientId})`} />}

        {!single && (
          <path
            d={geometry.line}
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        )}

        {geometry.points.map((entry) => (
          <circle
            key={`${entry.point.capturedAt}-${entry.point.price.amountMinor}`}
            cx={entry.x}
            cy={entry.y}
            r={single ? 6 : 4}
            fill="currentColor"
            stroke="white"
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
          >
            <title>
              {formatMoney(entry.point.price)} on {formatShortDate(entry.point.capturedAt)}
            </title>
          </circle>
        ))}

        <text
          x={CHART_PADDING.left}
          y={CHART_HEIGHT - 6}
          className="fill-ink-subtle"
          style={{ fontSize: 10 }}
        >
          {geometry.firstDate}
        </text>
        {!single && (
          <text
            x={CHART_WIDTH - CHART_PADDING.right}
            y={CHART_HEIGHT - 6}
            textAnchor="end"
            className="fill-ink-subtle"
            style={{ fontSize: 10 }}
          >
            {geometry.lastDate}
          </text>
        )}
      </svg>

      <figcaption className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-subtle">
        <span>
          {points.length} stored observation{points.length === 1 ? '' : 's'} · {currency}
        </span>
        {single && <span>· one point is a fact, not a trend</span>}
      </figcaption>
    </figure>
  );
}
