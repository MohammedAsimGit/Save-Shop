import { Clock3, Info, LineChart, RefreshCw } from 'lucide-react';
import { useState } from 'react';

import {
  DEFAULT_HISTORY_PERIOD,
  type HistoryObservation,
  type HistoryPeriod,
  type PriceHistoryResponse,
} from '@smart-shopping/shared';

import { useProductHistory } from '../../hooks/useProductHistory';
import { formatMoney, formatRelativeTime, formatShortDate } from '../../lib/format';
import { Badge } from './Badge';
import { buttonStyles } from './buttonStyles';
import { PriceHistoryChart } from './PriceHistoryChart';
import { SectionHeader } from './SectionHeader';
import { SkeletonBlock } from './LoadingSkeleton';

/**
 * Price history on the product page.
 *
 * Rules the UI enforces (they are not cosmetic):
 * - only verified observations are charted when any exist; demo points are
 *   excluded and said to be excluded, never blended into a "real" trend;
 * - the summary numbers describe the same series the chart draws;
 * - an empty window says so instead of showing a flat invented line.
 */

const PERIODS: { value: HistoryPeriod; label: string }[] = [
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
];

export function PriceHistorySection({ productId }: { readonly productId: string }) {
  const [period, setPeriod] = useState<HistoryPeriod>(DEFAULT_HISTORY_PERIOD);
  const { state, retry } = useProductHistory(productId, period);

  return (
    <section
      aria-labelledby="history-heading"
      className="rounded-card border border-line bg-surface p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <SectionHeader
          id="history-heading"
          title="Price history"
          description="Stored observations only. Nothing is interpolated, smoothed or back-filled."
        />
        <div role="group" aria-label="History period" className="flex gap-1">
          {PERIODS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setPeriod(option.value)}
              aria-pressed={period === option.value}
              className={buttonStyles({
                variant: period === option.value ? 'primary' : 'ghost',
                size: 'sm',
                className: 'px-3',
              })}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {state.status === 'loading' && (
        <div aria-busy="true" className="mt-4 space-y-2">
          <SkeletonBlock className="h-4 w-32" />
          <SkeletonBlock className="h-40 w-full" />
        </div>
      )}

      {state.status === 'error' && (
        <div className="mt-4 space-y-2">
          <p className="text-sm text-danger">{state.message}</p>
          {state.isNetworkError && (
            <p className="text-xs text-ink-muted">
              Start the API with <code className="font-mono">npm run dev:api</code>.
            </p>
          )}
          <button
            type="button"
            onClick={retry}
            aria-label="Retry price history"
            className={buttonStyles({ variant: 'secondary', size: 'sm' })}
          >
            <RefreshCw aria-hidden="true" className="size-4" />
            Retry
          </button>
          <p className="text-[11px] text-ink-subtle">
            No sample history is substituted when the API is unreachable.
          </p>
        </div>
      )}

      {state.status === 'ready' && <HistoryBody history={state.history} />}
    </section>
  );
}

function HistoryBody({ history }: { readonly history: PriceHistoryResponse }) {
  if (history.observations.length === 0) {
    return (
      <div className="mt-4 rounded-tile border border-dashed border-line-strong/70 bg-surface-muted/50 p-4">
        <p className="flex items-center gap-2 text-sm font-medium text-ink">
          <LineChart aria-hidden="true" className="size-4 text-ink-subtle" />
          No stored observation in the last {periodLabel(history.period)}
        </p>
        <p className="mt-1 text-sm text-ink-muted">
          History starts when the API reads a price source for this product. Nothing is drawn until
          that has happened.
        </p>
      </div>
    );
  }

  const verified = history.observations.filter((observation) => !observation.isSample);
  const sample = history.observations.filter((observation) => observation.isSample);
  const charted: HistoryObservation[] = verified.length > 0 ? verified : sample;
  const chartedIsSample = verified.length === 0;
  const summary = chartedIsSample ? history.summary.sample : history.summary.verified;
  const sources = [...new Set(charted.map((observation) => observation.source.displayName))];

  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {chartedIsSample ? (
          <Badge tone="outline">Demo observations</Badge>
        ) : (
          <Badge tone="success">Verified observations</Badge>
        )}
        <span className="text-[11px] text-ink-subtle">
          {formatShortDate(history.from)} – {formatShortDate(history.to)} ·{' '}
          {periodLabel(history.period)}
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat
          label={chartedIsSample ? 'Lowest demo price' : 'Lowest verified price'}
          value={summary.lowest ? formatMoney(summary.lowest.price) : '—'}
          hint={summary.lowest ? formatRelativeTime(summary.lowest.capturedAt) : undefined}
        />
        <Stat
          label="Latest observed"
          value={summary.latest ? formatMoney(summary.latest.price) : '—'}
          hint={summary.latest ? formatRelativeTime(summary.latest.capturedAt) : undefined}
        />
        <Stat label="Observations" value={String(summary.count)} />
        <Stat label="Source" value={sources.join(', ')} />
      </dl>

      <PriceHistoryChart
        points={charted.map((observation) => ({
          capturedAt: observation.capturedAt,
          price: observation.price,
        }))}
        label={
          chartedIsSample
            ? `Demo sample price observations over ${periodLabel(history.period)}`
            : `Verified price observations over ${periodLabel(history.period)}`
        }
      />

      {verified.length > 0 && sample.length > 0 && (
        <p className="flex items-start gap-2 text-[11px] text-ink-subtle">
          <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          {sample.length} demo observation{sample.length === 1 ? '' : 's'} are stored for this
          product but excluded from this chart: invented prices are never plotted as a marketplace
          trend.
        </p>
      )}

      {chartedIsSample && (
        <p className="flex items-start gap-2 text-[11px] text-ink-subtle">
          <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          These are invented demo prices recorded by the sample source. They are not marketplace
          history and must not be read as a real price trend.
        </p>
      )}

      <ul className="space-y-1 text-[11px] text-ink-subtle">
        {history.notices.map((notice) => (
          <li key={notice} className="flex items-start gap-1.5">
            <Clock3 aria-hidden="true" className="mt-0.5 size-3 shrink-0" />
            {notice}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  readonly label: string;
  readonly value: string;
  readonly hint?: string;
}) {
  return (
    <div className="rounded-tile border border-line px-3 py-2">
      <dt className="text-[10px] tracking-wide text-ink-subtle uppercase">{label}</dt>
      <dd className="tabular text-sm font-semibold text-ink">{value}</dd>
      {hint && <dd className="text-[10px] text-ink-subtle">{hint}</dd>}
    </div>
  );
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
