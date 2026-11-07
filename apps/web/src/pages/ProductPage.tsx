import {
  ArrowLeft,
  BellPlus,
  Check,
  Clock3,
  Info,
  RefreshCw,
  ShieldCheck,
  Star,
} from 'lucide-react';
import { Link, useParams } from 'react-router-dom';

import { Badge } from '../components/ui/Badge';
import { buttonStyles } from '../components/ui/buttonStyles';
import { DemoNotice } from '../components/ui/DemoNotice';
import { EmptyState } from '../components/ui/EmptyState';
import { SkeletonBlock } from '../components/ui/LoadingSkeleton';
import { PageContainer } from '../components/ui/PageContainer';
import { PriceHistorySection } from '../components/ui/PriceHistorySection';
import { DealLinkNote, PriceComparisonCard } from '../components/ui/PriceComparisonCard';
import { PriceLabel } from '../components/ui/PriceLabel';
import { ProductCard } from '../components/ui/ProductCard';
import { SectionHeader } from '../components/ui/SectionHeader';
import { resolveIcon } from '../components/ui/icons';
import { demoProducts, marketplaceById } from '../data/demoCatalog';
import { useProductComparison } from '../hooks/useProductComparison';
import { formatCompactCount, formatRating, formatRelativeTime } from '../lib/format';

/**
 * Product comparison screen.
 *
 * Product identity comes from the shared catalogue; every price comes from the
 * comparison API, which ranks offers through the shared engine. The screen shows
 * what the engine concluded - lowest, verified or sample - plus the observation
 * time and the source of each number. When the API is unreachable it says so
 * instead of falling back to sample prices as if they were live.
 */
export function ProductPage() {
  const { productId } = useParams<{ productId: string }>();
  const product = demoProducts.find((entry) => entry.id === productId);
  const { state, retry } = useProductComparison(product?.id);

  if (!product) {
    return (
      <PageContainer className="py-10">
        <EmptyState
          title="Product not found"
          description="This sample product does not exist. It may have been removed from the demo catalogue."
          action={
            <Link to="/search" className={buttonStyles({ size: 'sm' })}>
              Back to comparison
            </Link>
          }
        />
      </PageContainer>
    );
  }

  const Icon = resolveIcon(product.icon);
  const related = demoProducts
    .filter((entry) => entry.category === product.category && entry.id !== product.id)
    .slice(0, 4);

  const comparison = state.status === 'ready' ? state.comparison : null;
  const lowest = comparison?.lowest ?? null;
  const lowestVisuals = lowest ? visualsFor(lowest.marketplaceId, lowest.source.displayName) : null;

  const lowestLabel =
    comparison?.status === 'verified'
      ? 'Lowest verified price'
      : comparison?.status === 'sample_only'
        ? 'Lowest sample price'
        : 'Lowest eligible price';

  return (
    <PageContainer className="space-y-8 py-6 sm:py-8">
      <div className="flex items-center justify-between gap-3">
        <Link
          to="/search"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-ink"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Back to results
        </Link>
        <Badge tone="neutral">Sample product</Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-12 lg:gap-8">
        <div className="lg:col-span-5">
          <div
            className={`relative overflow-hidden rounded-card border border-line bg-gradient-to-br ${product.gradient} p-6 shadow-soft`}
          >
            <div className="flex aspect-square items-center justify-center">
              <Icon
                aria-hidden="true"
                className="size-40 text-slate-900/25 dark:text-white/25"
                strokeWidth={0.9}
              />
            </div>
            <span className="absolute top-4 left-4 rounded-full bg-white/80 px-2.5 py-1 text-[10px] font-bold tracking-[0.12em] text-slate-700 uppercase backdrop-blur dark:bg-slate-900/70 dark:text-slate-200">
              Placeholder artwork
            </span>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            {[
              {
                label: 'Marketplaces',
                value: comparison ? String(comparison.offers.length) : '—',
              },
              { label: 'Rating', value: formatRating(product.rating) },
              { label: 'Currency', value: comparison?.currency ?? 'INR' },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-tile border border-line bg-surface px-3 py-2.5 text-center"
              >
                <p className="tabular text-sm font-bold text-ink">{stat.value}</p>
                <p className="text-[10px] tracking-wide text-ink-subtle uppercase">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-5 lg:col-span-7">
          <div className="space-y-2">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-ink-subtle uppercase">
              {product.brand}
            </p>
            <h1 className="text-2xl leading-tight font-bold tracking-tight sm:text-3xl">
              {product.title}
            </h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-muted">
              <span className="inline-flex items-center gap-1">
                <Star aria-hidden="true" className="size-4 fill-amber-400 text-amber-400" />
                <span className="font-semibold text-ink">{formatRating(product.rating)}</span>
              </span>
              <span>{formatCompactCount(product.reviewCount)} ratings</span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1">
                <ShieldCheck
                  aria-hidden="true"
                  className="size-4 text-brand-dark dark:text-brand"
                />
                Every price carries a source
              </span>
            </div>
          </div>

          <div className="rounded-card border border-line bg-surface p-5 shadow-soft">
            {state.status === 'loading' && <PriceCardSkeleton />}

            {state.status === 'error' && (
              <div className="space-y-3">
                <div>
                  <p className="text-xs font-medium text-ink-subtle">Comparison unavailable</p>
                  <p className="mt-1 text-sm text-danger">{state.message}</p>
                </div>
                {state.isNetworkError && (
                  <p className="text-xs text-ink-muted">
                    Start the API with <code className="font-mono">npm run dev:api</code>.
                  </p>
                )}
                <button
                  type="button"
                  onClick={retry}
                  className={buttonStyles({ variant: 'secondary', size: 'sm' })}
                >
                  <RefreshCw aria-hidden="true" className="size-4" />
                  Retry
                </button>
                <p className="text-[11px] text-ink-subtle">
                  No fallback prices are shown: a comparison must come from the comparison engine.
                </p>
              </div>
            )}

            {comparison && (
              <>
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-ink-subtle">{lowestLabel}</p>
                    {lowest ? (
                      <PriceLabel
                        price={lowest.price}
                        compareAt={
                          comparison.status === 'sample_only' ? product.listPrice : undefined
                        }
                        size="hero"
                        emphasis
                      />
                    ) : (
                      <p className="text-lg font-semibold text-ink-muted">Currently unavailable</p>
                    )}
                  </div>
                  {lowest && lowest.source.verification === 'sample' ? (
                    <Badge tone="outline">Demo data</Badge>
                  ) : null}
                </div>

                {lowest && lowestVisuals && (
                  <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted">
                    <span className="inline-flex items-center gap-1.5">
                      <Clock3 aria-hidden="true" className="size-3.5" />
                      Observed {formatRelativeTime(lowest.capturedAt)}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {lowestVisuals.name} via {lowest.source.displayName}
                    </span>
                  </p>
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled
                    title="Alerts are gated per source: no enabled source permits them yet"
                    className={buttonStyles({ variant: 'primary', size: 'md' })}
                  >
                    <BellPlus aria-hidden="true" className="size-4" />
                    Track price
                  </button>
                  <Link
                    to="/premium"
                    className={buttonStyles({ variant: 'secondary', size: 'md' })}
                  >
                    Premium alerts
                  </Link>
                </div>
                <p className="mt-2 text-[11px] text-ink-subtle">
                  Price alerts stay disabled until a source permits them and accounts exist.
                </p>
              </>
            )}
          </div>

          <section aria-labelledby="offers-heading" className="space-y-3">
            <SectionHeader
              id="offers-heading"
              title="Marketplace comparison"
              description="Cheapest eligible offer first. Stale and out-of-stock observations are excluded and counted, never ranked."
            />

            {state.status === 'loading' && <OfferListSkeleton />}

            {state.status === 'error' && (
              <div className="rounded-card border border-dashed border-line-strong/70 bg-surface-muted/50 p-5 text-sm text-ink-muted">
                Offers cannot be shown while the comparison API is unreachable.
              </div>
            )}

            {comparison && (
              <>
                {comparison.offers.length > 0 ? (
                  <ul className="space-y-2.5">
                    {comparison.offers.map((offer) => {
                      const visuals = visualsFor(offer.marketplaceId, offer.source.displayName);
                      return (
                        <PriceComparisonCard
                          key={`${offer.marketplaceId}-${offer.capturedAt}`}
                          offer={offer}
                          marketplace={visuals}
                          listPrice={
                            comparison.status === 'sample_only' ? product.listPrice : undefined
                          }
                        />
                      );
                    })}
                  </ul>
                ) : (
                  <div className="rounded-card border border-dashed border-line-strong/70 bg-surface-muted/50 p-5 text-sm text-ink-muted">
                    No eligible observation for this product: every offer was stale, out of stock or
                    from a source without permission.
                  </div>
                )}

                <ExcludedSummary excluded={comparison.excluded} />
                <DealLinkNote />
              </>
            )}
          </section>

          {comparison && (
            <SourceCoverage sources={comparison.sources} notices={comparison.notices} />
          )}

          <section className="rounded-card border border-line bg-surface p-5">
            <h2 className="text-sm font-semibold text-ink">Highlights</h2>
            <ul className="mt-2 space-y-1.5">
              {product.highlights.map((highlight) => (
                <li key={highlight} className="flex items-start gap-2 text-sm text-ink-muted">
                  <Check
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0 text-brand-dark dark:text-brand"
                  />
                  {highlight}
                </li>
              ))}
            </ul>
          </section>

          <PriceHistorySection productId={product.id} />
        </div>
      </div>

      {related.length > 0 && (
        <section aria-labelledby="related-heading" className="space-y-3">
          <SectionHeader id="related-heading" title="Similar products" />
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {related.map((entry) => (
              <ProductCard key={entry.id} product={entry} />
            ))}
          </div>
        </section>
      )}

      <DemoNotice />
    </PageContainer>
  );
}

function visualsFor(marketplaceId: string, fallbackName: string) {
  const marketplace = marketplaceById(marketplaceId);
  if (marketplace) {
    return { name: marketplace.name, short: marketplace.short, accent: marketplace.accent };
  }
  return {
    name: fallbackName,
    short: fallbackName.slice(0, 2).toUpperCase(),
    accent: '#15803d',
  };
}

const EXCLUSION_LABELS: Record<string, string> = {
  invalid: 'invalid observation',
  unknown_source: 'unregistered source',
  stale: 'past freshness limit',
  unavailable: 'out of stock',
  currency_mismatch: 'different currency',
  future_timestamp: 'future timestamp',
};

function ExcludedSummary({ excluded }: { readonly excluded: { reason: string }[] }) {
  if (excluded.length === 0) return null;

  const counts = excluded.reduce<Record<string, number>>((accumulator, entry) => {
    accumulator[entry.reason] = (accumulator[entry.reason] ?? 0) + 1;
    return accumulator;
  }, {});

  return (
    <p className="flex flex-wrap items-center gap-2 text-[11px] text-ink-subtle">
      <Info aria-hidden="true" className="size-3.5" />
      Not ranked:
      {Object.entries(counts).map(([reason, count]) => (
        <span
          key={reason}
          className="rounded-full border border-line px-2 py-0.5 font-medium text-ink-muted"
        >
          {count} {EXCLUSION_LABELS[reason] ?? reason}
        </span>
      ))}
    </p>
  );
}

function SourceCoverage({
  sources,
  notices,
}: {
  readonly sources: {
    id: string;
    displayName: string;
    enabled: boolean;
    disabledReason?: string;
  }[];
  readonly notices: readonly string[];
}) {
  return (
    <section
      aria-labelledby="coverage-heading"
      className="rounded-card border border-line bg-surface p-5"
    >
      <SectionHeader
        id="coverage-heading"
        title="Source coverage"
        description="Which price sources answered this comparison, and which are still waiting for permission."
      />
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {sources.map((source) => (
          <li
            key={source.id}
            className="flex items-start justify-between gap-3 rounded-tile border border-line px-3 py-2"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">{source.displayName}</p>
              {source.disabledReason ? (
                <p className="mt-0.5 text-[11px] leading-snug text-ink-subtle">
                  {source.disabledReason}
                </p>
              ) : null}
            </div>
            <Badge tone={source.enabled ? 'success' : 'neutral'}>
              {source.enabled ? 'Enabled' : 'Pending'}
            </Badge>
          </li>
        ))}
      </ul>
      {notices.length > 0 && (
        <ul className="mt-3 space-y-1 text-[11px] text-ink-subtle">
          {notices.map((notice) => (
            <li key={notice}>{notice}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PriceCardSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-2">
      <span className="sr-only">Loading comparison</span>
      <SkeletonBlock className="h-3 w-32" />
      <SkeletonBlock className="h-9 w-48" />
      <SkeletonBlock className="h-3 w-64" />
    </div>
  );
}

function OfferListSkeleton() {
  return (
    <div aria-busy="true" className="space-y-2.5">
      {[0, 1, 2].map((index) => (
        <SkeletonBlock key={index} className="h-20 w-full rounded-tile" />
      ))}
    </div>
  );
}
