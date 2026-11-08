import { Fingerprint, Info, RefreshCw } from 'lucide-react';

import type { MarketplaceListing, MatchStatus } from '@smart-shopping/shared';

import { useProductIdentity } from '../../hooks/useProductIdentity';
import { Badge, type BadgeTone } from './Badge';
import { buttonStyles } from './buttonStyles';
import { SkeletonBlock } from './LoadingSkeleton';
import { SectionHeader } from './SectionHeader';

/**
 * Canonical product identity.
 *
 * This block answers "what does the platform think this product is, and which
 * marketplace items does it accept as the same thing?" - separate from the price
 * comparison. Unresolved listings are shown here with their reason, and are never
 * presented as part of the priced comparison.
 */

const STATUS_TONE: Record<MatchStatus, BadgeTone> = {
  exact: 'success',
  strong: 'success',
  possible: 'warning',
  conflict: 'discount',
  unmatched: 'neutral',
};

const STATUS_LABEL: Record<MatchStatus, string> = {
  exact: 'Exact match',
  strong: 'Strong match',
  possible: 'Needs review',
  conflict: 'Conflicting identity',
  unmatched: 'Unmatched',
};

function provenanceLabel(provenance: string, isSample: boolean): string {
  if (isSample) return 'Demo record';
  if (provenance === 'authorized_source') return 'Authorized source';
  if (provenance === 'manual') return 'Manual entry';
  return 'Demo record';
}

export function ProductIdentitySection({ productId }: { readonly productId: string }) {
  const { state, retry } = useProductIdentity(productId);

  if (state.status === 'loading') {
    return (
      <section
        aria-labelledby="identity-heading"
        className="rounded-card border border-line bg-surface p-5"
      >
        <SectionHeader
          id="identity-heading"
          title="Product identity"
          description="Canonical record and marketplace listings."
        />
        <div aria-busy="true" className="mt-4 space-y-2">
          <SkeletonBlock className="h-4 w-40" />
          <SkeletonBlock className="h-20 w-full" />
        </div>
      </section>
    );
  }

  if (state.status === 'error') {
    return (
      <section
        aria-labelledby="identity-heading"
        className="rounded-card border border-line bg-surface p-5"
      >
        <SectionHeader
          id="identity-heading"
          title="Product identity"
          description="Canonical record and marketplace listings."
        />
        <p className="mt-3 text-sm text-ink-muted">
          Identity is unavailable right now{state.isNetworkError ? ' (the API is unreachable)' : ''}
          . The price comparison above is unaffected.
        </p>
        <button
          type="button"
          onClick={retry}
          className={buttonStyles({ variant: 'secondary', size: 'sm', className: 'mt-3' })}
        >
          <RefreshCw aria-hidden="true" className="size-4" />
          Retry identity
        </button>
      </section>
    );
  }

  const { identity, listings } = state;
  const product = identity.product;

  return (
    <section
      aria-labelledby="identity-heading"
      className="rounded-card border border-line bg-surface p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <SectionHeader
          id="identity-heading"
          title="Product identity"
          description="Identity is owned by the platform catalogue, not by a marketplace title."
        />
        <Badge tone={product.isSample ? 'outline' : 'brand'}>
          {provenanceLabel(product.provenance, product.isSample)}
        </Badge>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <div className="rounded-tile border border-line px-3 py-2">
          <dt className="text-[10px] tracking-wide text-ink-subtle uppercase">Catalogue id</dt>
          <dd className="font-mono text-xs break-all text-ink">{product.id}</dd>
        </div>
        <div className="rounded-tile border border-line px-3 py-2">
          <dt className="text-[10px] tracking-wide text-ink-subtle uppercase">Brand</dt>
          <dd className="font-semibold text-ink">{product.brand}</dd>
        </div>
        <div className="rounded-tile border border-line px-3 py-2">
          <dt className="text-[10px] tracking-wide text-ink-subtle uppercase">Category</dt>
          <dd className="font-semibold text-ink">{product.category}</dd>
        </div>
        <div className="rounded-tile border border-line px-3 py-2">
          <dt className="text-[10px] tracking-wide text-ink-subtle uppercase">Identifiers</dt>
          <dd className="text-xs text-ink">
            {product.gtin
              ? `GTIN ${product.gtin}`
              : product.mpn
                ? `MPN ${product.mpn}`
                : product.model
                  ? `Model ${product.model}`
                  : 'None recorded'}
          </dd>
        </div>
      </dl>

      {product.variantOf && (
        <p className="mt-3 flex items-start gap-2 text-[11px] text-ink-subtle">
          <Fingerprint aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          Variant of <span className="font-mono">{product.variantOf}</span>
          {Object.entries(product.variantAttributes).length > 0 &&
            ` · ${Object.entries(product.variantAttributes)
              .map(([key, value]) => `${key}: ${value}`)
              .join(', ')}`}
        </p>
      )}

      <div className="mt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-ink">Marketplace listings</h3>
          <span className="text-[11px] text-ink-subtle">
            {identity.listingSummary.resolved} resolved · {identity.listingSummary.unresolved}{' '}
            unresolved
          </span>
        </div>

        {!listings || listings.listings.length === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">
            No resolved marketplace listing for this product yet. Only exact and strong matches are
            accepted; possible and conflicting matches stay unresolved.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {listings.listings.map((listing) => (
              <ListingRow key={listing.id} listing={listing} />
            ))}
          </ul>
        )}

        <p className="mt-3 flex items-start gap-2 text-[11px] text-ink-subtle">
          <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          Match confidence is a deterministic strength score from documented rules, not a
          probability.
        </p>
      </div>
    </section>
  );
}

function ListingRow({ listing }: { readonly listing: MarketplaceListing }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-tile border border-line px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-ink">{listing.title}</p>
        <p className="text-[11px] text-ink-subtle">
          {listing.marketplaceId} · {listing.sourceId} · observed{' '}
          {new Date(listing.lastObservedAt).toLocaleDateString('en-IN')}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {listing.isSample && <Badge tone="neutral">Demo</Badge>}
        <Badge tone={STATUS_TONE[listing.match.status]}>
          {STATUS_LABEL[listing.match.status]} · {listing.match.confidence}
        </Badge>
      </div>
    </li>
  );
}
