import { Activity, BellRing, Mail, Smartphone, Target } from 'lucide-react';
import { Link } from 'react-router-dom';

import {
  availableMarketplaceCount,
  demoProducts,
  lowestOffer,
  type DemoProduct,
  type Money,
} from '../data/demoCatalog';
import { Badge } from '../components/ui/Badge';
import { buttonStyles } from '../components/ui/buttonStyles';
import { DemoNotice } from '../components/ui/DemoNotice';
import { PageContainer } from '../components/ui/PageContainer';
import { PriceLabel } from '../components/ui/PriceLabel';
import { SectionHeader } from '../components/ui/SectionHeader';
import { StatusBadge } from '../components/StatusBadge';
import { useApiHealth } from '../hooks/useApiHealth';
import { formatMoney } from '../lib/format';
import { webEnv } from '../lib/env';

/**
 * Price tracking.
 *
 * Real alerts need an account and a price-snapshot pipeline, neither of which
 * exists. Rather than fake a live watchlist, the page shows a clearly labelled
 * sample of what tracking will look like and keeps the Sprint 0 API smoke test
 * visible.
 */

/** Deterministic sample targets so the screen is stable between reloads. */
const sampleWatchlist = [
  { productId: 'sony-wh1000xm5', targetFactor: 0.92 },
  { productId: 'nike-pegasus-40', targetFactor: 0.9 },
  { productId: 'iphone-15-128', targetFactor: 1.02 },
] as const;

function targetFor(product: DemoProduct, factor: number): Money {
  const lowest = lowestOffer(product);
  const base = lowest?.price.amountMinor ?? product.listPrice.amountMinor;
  // Round to whole rupees so the target reads like a number a person would type.
  return { amountMinor: Math.round((base * factor) / 100) * 100, currency: 'INR' };
}

export function TrackingPage() {
  const { state, retry } = useApiHealth();

  const rows = sampleWatchlist.flatMap(({ productId, targetFactor }) => {
    const product = demoProducts.find((candidate) => candidate.id === productId);
    const lowest = product ? lowestOffer(product) : undefined;
    if (!product || !lowest) return [];
    const target = targetFor(product, targetFactor);
    return [{ product, lowest, target, met: lowest.price.amountMinor <= target.amountMinor }];
  });

  return (
    <PageContainer className="space-y-6 py-6 sm:py-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Price tracking</h1>
        <p className="max-w-2xl text-sm text-ink-muted">
          Follow a product and get told when it drops below your target. Tracking needs an account
          plus real price history, so the list below is a sample of the intended screen rather than
          a live watchlist.
        </p>
      </div>

      <DemoNotice />

      <section aria-labelledby="watchlist-heading" className="space-y-3">
        <SectionHeader
          id="watchlist-heading"
          title="Sample watchlist"
          description="Targets are invented for this preview; nothing here is saved or monitored."
          action={<Badge tone="outline">Preview only</Badge>}
        />
        <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface shadow-soft">
          {rows.map(({ product, lowest, target, met }) => (
            <li
              key={product.id}
              className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
            >
              <div className="min-w-0">
                <p className="text-[11px] font-semibold tracking-wide text-ink-subtle uppercase">
                  {product.brand}
                </p>
                <Link
                  to={`/product/${product.id}`}
                  className="line-clamp-2 text-sm font-semibold text-ink hover:text-brand-dark dark:hover:text-brand"
                >
                  {product.title}
                </Link>
                <p className="mt-0.5 text-xs text-ink-muted">
                  Cheapest of {availableMarketplaceCount(product)}{' '}
                  {availableMarketplaceCount(product) === 1 ? 'marketplace' : 'marketplaces'}
                </p>
              </div>

              <div className="flex items-center justify-between gap-4 sm:justify-end sm:gap-6">
                <div className="text-left sm:text-right">
                  <PriceLabel price={lowest.price} size="md" emphasis={met} />
                  <p className="tabular mt-0.5 flex items-center gap-1 text-xs text-ink-muted sm:justify-end">
                    <Target aria-hidden="true" className="size-3" />
                    Target {formatMoney(target)}
                  </p>
                </div>
                <Badge tone={met ? 'success' : 'neutral'}>
                  {met ? 'Below target' : 'Above target'}
                </Badge>
              </div>
            </li>
          ))}
        </ul>
        <p className="flex items-center gap-2 text-xs text-ink-subtle">
          <BellRing aria-hidden="true" className="size-3.5" />
          Alerts need an account and a price-snapshot pipeline; neither exists in this build.
        </p>
      </section>

      <section aria-labelledby="status-heading" className="space-y-3">
        <SectionHeader
          id="status-heading"
          title="Monitoring service status"
          description="A real request to the API, so the web-to-API wiring stays verifiable."
        />
        <div className="rounded-card border border-line bg-surface p-5 shadow-soft">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Activity aria-hidden="true" className="size-4 text-brand-dark dark:text-brand" />
              <h3 className="text-sm font-semibold text-ink">Backend API</h3>
            </div>
            <StatusBadge tone={toneFor(state)} label={labelFor(state)} />
          </div>

          <dl className="mt-3 space-y-1.5 text-sm">
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-ink-muted">Base URL</dt>
              <dd className="font-mono text-xs text-ink">{webEnv.apiBaseUrl}</dd>
            </div>
            {state.status === 'ready' && (
              <div className="flex flex-wrap justify-between gap-2">
                <dt className="text-ink-muted">Database</dt>
                <dd className="font-mono text-xs text-ink">
                  {state.health.checks.database.status}
                </dd>
              </div>
            )}
          </dl>

          {state.status === 'error' && (
            <div className="mt-3 rounded-tile bg-danger/5 p-3 text-sm text-danger">
              <p>{state.message}</p>
              {state.isNetworkError && (
                <p className="mt-1 text-ink-muted">
                  Start the API with <code className="font-mono">npm run dev:api</code>.
                </p>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={retry}
            className={buttonStyles({ variant: 'secondary', size: 'sm', className: 'mt-3' })}
          >
            Re-check
          </button>
        </div>
      </section>

      <section aria-labelledby="planned-heading" className="space-y-3">
        <SectionHeader id="planned-heading" title="What tracking will do" />
        <ol className="grid gap-3 sm:grid-cols-3">
          {[
            {
              icon: BellRing,
              title: 'Target price',
              body: 'Set the amount you are willing to pay and watch a single product.',
            },
            {
              icon: Mail,
              title: 'One clear alert',
              body: 'A notification when a verified price crosses your target, with the observation time.',
            },
            {
              icon: Smartphone,
              title: 'Same on both clients',
              body: 'Alerts live on the account, so web and mobile stay in step.',
            },
          ].map(({ icon: Icon, title, body }) => (
            <li key={title} className="rounded-card border border-line bg-surface p-5">
              <Icon aria-hidden="true" className="mb-2 size-5 text-brand-dark dark:text-brand" />
              <h3 className="text-sm font-semibold text-ink">{title}</h3>
              <p className="mt-1 text-sm text-ink-muted">{body}</p>
            </li>
          ))}
        </ol>
        <p className="flex items-center gap-2 text-xs text-ink-subtle">
          <Badge tone="outline">Planned</Badge>
          Notification channels (email or push) are still undecided.
        </p>
      </section>
    </PageContainer>
  );
}

function toneFor(state: ReturnType<typeof useApiHealth>['state']) {
  if (state.status === 'loading') return 'neutral' as const;
  if (state.status === 'error') return 'error' as const;
  return state.health.status === 'ok' ? ('ok' as const) : ('warn' as const);
}

function labelFor(state: ReturnType<typeof useApiHealth>['state']): string {
  if (state.status === 'loading') return 'Checking...';
  if (state.status === 'error') return 'Unreachable';
  return state.health.status === 'ok' ? 'Healthy' : 'Degraded';
}
