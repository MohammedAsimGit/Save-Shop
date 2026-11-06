import { Check, Clock3, Info, X } from 'lucide-react';

import type { DemoMarketplace, Offer } from '../../data/demoCatalog';
import { formatRelativeTime } from '../../lib/format';
import { Badge } from './Badge';
import { buttonStyles } from './buttonStyles';
import { PriceLabel } from './PriceLabel';

/**
 * One marketplace's price for a product.
 *
 * The cheapest in-stock offer is emphasised and labelled "Lowest". Out-of-stock
 * offers stay visible but are never presented as a price you can act on, and the
 * CTA is inert because no outbound marketplace link exists yet.
 */
export function PriceComparisonCard({
  offer,
  marketplace,
  listPrice,
  isLowest,
}: {
  readonly offer: Offer;
  readonly marketplace: DemoMarketplace;
  readonly listPrice: Offer['price'];
  readonly isLowest: boolean;
}) {
  return (
    <li
      className={`relative flex flex-col gap-3 rounded-tile border p-4 sm:flex-row sm:items-center sm:justify-between ${
        isLowest ? 'border-brand/40 bg-brand-soft/60 dark:bg-brand-soft' : 'border-line bg-surface'
      }`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span
          aria-hidden="true"
          className="grid size-10 shrink-0 place-items-center rounded-xl text-sm font-bold text-white"
          style={{ backgroundColor: marketplace.accent }}
        >
          {marketplace.short}
        </span>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold text-ink">{marketplace.name}</p>
            {isLowest && (
              <Badge tone="success" icon={<Check aria-hidden="true" className="size-3" />}>
                Lowest
              </Badge>
            )}
            {!offer.inStock && (
              <Badge tone="neutral" icon={<X aria-hidden="true" className="size-3" />}>
                Out of stock
              </Badge>
            )}
          </div>
          <p className="mt-1 flex items-center gap-1 text-xs text-ink-muted">
            <Clock3 aria-hidden="true" className="size-3" />
            Observed {formatRelativeTime(offer.observedAt)}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 sm:justify-end">
        <div className="text-right sm:text-left">
          <PriceLabel price={offer.price} compareAt={listPrice} size="md" emphasis={isLowest} />
          {offer.discountPercent ? (
            <p className="text-[11px] font-medium text-discount">
              {offer.discountPercent}% below list
            </p>
          ) : null}
        </div>

        <button
          type="button"
          /* Always disabled: without an authorised integration there is nowhere to go. */
          disabled
          title={
            offer.inStock
              ? 'Outbound marketplace links arrive when an integration is authorised'
              : 'This marketplace is out of stock'
          }
          aria-describedby="deal-link-note"
          className={buttonStyles({
            variant: isLowest ? 'primary' : 'secondary',
            size: 'sm',
            className: 'shrink-0',
          })}
        >
          View deal
        </button>
      </div>
    </li>
  );
}

/** Always rendered once per comparison list, so the inert CTA is explained. */
export function DealLinkNote() {
  return (
    <p id="deal-link-note" className="flex items-start gap-2 text-xs text-ink-subtle">
      <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
      Deal buttons are disabled in this build: no marketplace integration or affiliate link is
      authorised yet, and sample prices must not be presented as live offers.
    </p>
  );
}
