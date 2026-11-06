import { ArrowLeft, BellPlus, Check, Clock3, Info, ShieldCheck, Star } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';

import { Badge } from '../components/ui/Badge';
import { buttonStyles } from '../components/ui/buttonStyles';
import { DemoNotice } from '../components/ui/DemoNotice';
import { EmptyState } from '../components/ui/EmptyState';
import { PageContainer } from '../components/ui/PageContainer';
import { PriceComparisonCard, DealLinkNote } from '../components/ui/PriceComparisonCard';
import { PriceLabel } from '../components/ui/PriceLabel';
import { ProductCard } from '../components/ui/ProductCard';
import { SectionHeader } from '../components/ui/SectionHeader';
import { resolveIcon } from '../components/ui/icons';
import {
  availableMarketplaceCount,
  categoryById,
  demoProducts,
  lowestOffer,
  marketplaceById,
  rankedOffers,
  savingsAgainstList,
} from '../data/demoCatalog';
import { formatCompactCount, formatRating } from '../lib/format';

/**
 * Product comparison screen.
 *
 * Every offer row states its marketplace, stock status and observation time. The
 * lowest in-stock price is labelled; out-of-stock prices remain visible but are
 * never presented as an actionable deal.
 */
export function ProductPage() {
  const { productId } = useParams<{ productId: string }>();
  const product = demoProducts.find((entry) => entry.id === productId);

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

  const offers = rankedOffers(product);
  const best = lowestOffer(product);
  const Icon = resolveIcon(product.icon);
  const category = categoryById(product.category);
  const related = demoProducts
    .filter((entry) => entry.category === product.category && entry.id !== product.id)
    .slice(0, 4);

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
              { label: 'Marketplaces', value: String(availableMarketplaceCount(product)) },
              {
                label: 'Best saving',
                value: `${Math.round((savingsAgainstList(product) / product.listPrice.amountMinor) * 100)}%`,
              },
              { label: 'Rating', value: formatRating(product.rating) },
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
              {category ? ` · ${category.label}` : ''}
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
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-ink-subtle">Lowest in-stock price</p>
                {best ? (
                  <PriceLabel
                    price={best.price}
                    compareAt={product.listPrice}
                    size="hero"
                    emphasis
                  />
                ) : (
                  <p className="text-lg font-semibold text-ink-muted">Currently unavailable</p>
                )}
              </div>
              {best?.discountPercent ? (
                <Badge tone="discount">{best.discountPercent}% below list</Badge>
              ) : null}
            </div>

            {best && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-muted">
                <Clock3 aria-hidden="true" className="size-3.5" />
                Cheapest at {marketplaceById(best.marketplaceId)?.name}, observed{' '}
                {new Date(best.observedAt).toLocaleTimeString('en-IN', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled
                title="Tracking requires an account, which this build does not implement"
                className={buttonStyles({ variant: 'primary', size: 'md' })}
              >
                <BellPlus aria-hidden="true" className="size-4" />
                Track price
              </button>
              <Link to="/premium" className={buttonStyles({ variant: 'secondary', size: 'md' })}>
                Premium alerts
              </Link>
            </div>
            <p className="mt-2 text-[11px] text-ink-subtle">
              Price tracking needs a signed-in account; authentication is not implemented in this
              sprint.
            </p>
          </div>

          <section aria-labelledby="offers-heading" className="space-y-3">
            <SectionHeader
              id="offers-heading"
              title="Marketplace comparison"
              description="Cheapest in-stock offer first. Out-of-stock listings are shown, never ranked."
            />
            <ul className="space-y-2.5">
              {offers.map((offer) => {
                const marketplace = marketplaceById(offer.marketplaceId);
                if (!marketplace) return null;
                return (
                  <PriceComparisonCard
                    key={offer.marketplaceId}
                    offer={offer}
                    marketplace={marketplace}
                    listPrice={product.listPrice}
                    isLowest={offer.marketplaceId === best?.marketplaceId}
                  />
                );
              })}
            </ul>
            <DealLinkNote />
          </section>

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

          <section className="rounded-card border border-dashed border-line-strong/70 bg-surface-muted/50 p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
              <Info aria-hidden="true" className="size-4 text-ink-subtle" />
              Price history is not available yet
            </h2>
            <p className="mt-1 text-sm text-ink-muted">
              A trend chart needs real observation snapshots from marketplace integrations. This
              build stores none, so it shows none.
            </p>
          </section>
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
