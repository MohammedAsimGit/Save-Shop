import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

import type { DemoMarketplace } from '../../data/demoCatalog';

/**
 * Marketplace entry in the horizontal rail.
 *
 * Shows a neutral initials tile rather than a brand logo: we hold no logo licence
 * and no verified inventory from these providers.
 */
export function MarketplaceCard({
  marketplace,
  productCount,
  lowestPriceLabel,
}: {
  readonly marketplace: DemoMarketplace;
  readonly productCount: number;
  readonly lowestPriceLabel?: string;
}) {
  return (
    <Link
      to={`/search?marketplace=${marketplace.id}`}
      className="group flex w-[220px] shrink-0 items-center gap-3 rounded-tile border border-line bg-surface p-3.5 shadow-soft transition-colors hover:border-line-strong"
    >
      <span
        aria-hidden="true"
        className="grid size-11 shrink-0 place-items-center rounded-xl text-base font-bold text-white"
        style={{ backgroundColor: marketplace.accent }}
      >
        {marketplace.short}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-ink">{marketplace.name}</span>
        <span className="mt-0.5 block truncate text-xs text-ink-muted">
          {productCount} {productCount === 1 ? 'product' : 'products'}
          {lowestPriceLabel ? ` · from ${lowestPriceLabel}` : ''}
        </span>
      </span>

      <ChevronRight
        aria-hidden="true"
        className="size-4 shrink-0 text-ink-subtle transition-transform group-hover:translate-x-0.5"
      />
    </Link>
  );
}
