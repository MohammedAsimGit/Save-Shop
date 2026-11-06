import { Store, Star } from 'lucide-react';
import { Link } from 'react-router-dom';

import { availableMarketplaceCount, lowestOffer, type DemoProduct } from '../../data/demoCatalog';
import { formatCompactCount, formatRating } from '../../lib/format';
import { Badge } from './Badge';
import { resolveIcon } from './icons';
import { PriceLabel } from './PriceLabel';

/**
 * Product comparison card: the cheapest verified offer is the focal point, with
 * the number of marketplaces carrying the item as secondary information.
 *
 * Artwork is a generated icon-on-gradient tile, never a marketplace photo.
 */
export function ProductCard({ product }: { readonly product: DemoProduct }) {
  const lowest = lowestOffer(product);
  const marketplaceCount = availableMarketplaceCount(product);
  const Icon = resolveIcon(product.icon);

  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-card border border-line bg-surface shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-card">
      <div
        className={`relative aspect-[4/3] w-full overflow-hidden bg-gradient-to-br ${product.gradient}`}
      >
        <Icon
          aria-hidden="true"
          className="absolute top-1/2 left-1/2 size-20 -translate-x-1/2 -translate-y-1/2 text-slate-900/25 transition-transform duration-500 group-hover:scale-105 dark:text-white/25"
          strokeWidth={1.2}
        />

        <div className="absolute inset-x-3 top-3 flex items-start justify-between gap-2">
          {lowest?.discountPercent ? (
            <Badge tone="discount">{lowest.discountPercent}% off</Badge>
          ) : (
            <span />
          )}
          <Badge
            tone="neutral"
            className="bg-white/80 text-slate-700 backdrop-blur dark:bg-slate-900/70 dark:text-slate-200"
          >
            Demo
          </Badge>
        </div>

        <div className="absolute inset-x-3 bottom-3 flex items-center gap-1.5 text-[11px] font-medium text-slate-700 dark:text-slate-200">
          <Store aria-hidden="true" className="size-3.5" />
          {marketplaceCount} {marketplaceCount === 1 ? 'marketplace' : 'marketplaces'}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <p className="text-[11px] font-semibold tracking-[0.12em] text-ink-subtle uppercase">
          {product.brand}
        </p>

        <h3 className="line-clamp-2 text-[15px] leading-snug font-semibold text-ink">
          <Link to={`/product/${product.id}`} className="after:absolute after:inset-0">
            {product.title}
          </Link>
        </h3>

        <div className="flex items-center gap-1.5 text-xs text-ink-muted">
          <Star aria-hidden="true" className="size-3.5 fill-amber-400 text-amber-400" />
          <span className="tabular font-semibold text-ink">{formatRating(product.rating)}</span>
          <span aria-label={`${product.reviewCount} ratings`}>
            ({formatCompactCount(product.reviewCount)})
          </span>
        </div>

        <div className="mt-auto flex items-end justify-between gap-2 pt-2">
          <div className="min-w-0">
            <p className="text-[11px] text-ink-subtle">Lowest price</p>
            {lowest ? (
              <PriceLabel price={lowest.price} compareAt={product.listPrice} size="lg" emphasis />
            ) : (
              <p className="text-sm font-semibold text-ink-muted">Out of stock</p>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
