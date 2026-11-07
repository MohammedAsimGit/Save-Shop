import { Check, Clock3, FlaskConical, Info, ShieldCheck, X } from 'lucide-react';

import type { ComparedOffer } from '@smart-shopping/shared';

import { formatRelativeTime } from '../../lib/format';
import { Badge } from './Badge';
import { buttonStyles } from './buttonStyles';
import { PriceLabel } from './PriceLabel';

/**
 * One marketplace's offer, as returned by the comparison API.
 *
 * The card never decides what is "lowest" or "verified" - the engine does, and
 * those flags arrive on the offer. It only presents them. Sample sources are
 * labelled on the row itself so a demo price cannot be mistaken for a live one,
 * and the CTA stays inert because no outbound affiliate link is authorised.
 */
export function PriceComparisonCard({
  offer,
  marketplace,
  listPrice,
}: {
  readonly offer: ComparedOffer;
  /** Visual identity resolved by the caller; falls back to the source name. */
  readonly marketplace?: { readonly name: string; readonly short: string; readonly accent: string };
  readonly listPrice?: { readonly amountMinor: number; readonly currency: string };
}) {
  const isSample = offer.source.verification === 'sample';
  const name = marketplace?.name ?? offer.source.displayName;

  return (
    <li
      className={`relative flex flex-col gap-3 rounded-tile border p-4 sm:flex-row sm:items-center sm:justify-between ${
        offer.isLowest
          ? 'border-brand/40 bg-brand-soft/60 dark:bg-brand-soft'
          : 'border-line bg-surface'
      }`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span
          aria-hidden="true"
          className="grid size-10 shrink-0 place-items-center rounded-xl text-sm font-bold text-white"
          style={{ backgroundColor: marketplace?.accent ?? '#15803d' }}
        >
          {marketplace?.short ?? name.slice(0, 2).toUpperCase()}
        </span>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold text-ink">{name}</p>
            {offer.isLowest && (
              <Badge tone="success" icon={<Check aria-hidden="true" className="size-3" />}>
                Lowest
              </Badge>
            )}
            {isSample && (
              <Badge tone="outline" icon={<FlaskConical aria-hidden="true" className="size-3" />}>
                Demo
              </Badge>
            )}
            {offer.isVerified && !isSample && (
              <Badge tone="success" icon={<ShieldCheck aria-hidden="true" className="size-3" />}>
                Verified
              </Badge>
            )}
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-muted">
            <span className="inline-flex items-center gap-1">
              <Clock3 aria-hidden="true" className="size-3" />
              Observed {formatRelativeTime(offer.capturedAt)}
            </span>
            <span aria-hidden="true">·</span>
            <span className="truncate">{offer.source.attribution.label}</span>
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 sm:justify-end">
        <div className="text-right sm:text-left">
          <PriceLabel
            price={offer.price}
            compareAt={listPrice}
            size="md"
            emphasis={offer.isLowest}
          />
          <p className="text-[11px] font-medium text-ink-subtle">
            {offer.freshness === 'fresh' ? 'Within source freshness limit' : 'Stale observation'}
          </p>
        </div>

        <button
          type="button"
          /* Always disabled: without an authorised integration there is nowhere to go. */
          disabled
          title="Outbound marketplace links arrive when an integration is authorised"
          aria-describedby="deal-link-note"
          className={buttonStyles({
            variant: offer.isLowest ? 'primary' : 'secondary',
            size: 'sm',
            className: 'shrink-0',
          })}
        >
          View deal
          <X aria-hidden="true" className="size-3" />
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
