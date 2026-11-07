import type { MarketSource, MarketSourceKind } from '@smart-shopping/shared';

import type {
  MarketSourceAdapter,
  SourceFetchContext,
  SourceFetchResult,
} from './sourceAdapter.js';

/**
 * Placeholders for marketplaces whose permission is unresolved.
 *
 * These are descriptors, not integrations: there is no request code, no endpoint
 * and no credential, and `fetchOffers` refuses to run. They exist so the API can
 * report coverage honestly ("Amazon: pending permission") instead of pretending a
 * marketplace is either live or irrelevant.
 *
 * See docs/INGESTION_FEASIBILITY.md for the evidence behind each status.
 */

function pendingSource(config: {
  readonly id: string;
  readonly displayName: string;
  readonly kind: MarketSourceKind;
  readonly marketplaceId: string;
  readonly note: string;
  readonly disabledReason: string;
}): MarketSource {
  return {
    id: config.id,
    displayName: config.displayName,
    kind: config.kind,
    verification: 'verified',
    attribution: { label: config.displayName },
    permission: {
      status: 'pending',
      note: config.note,
      permitsPriceAlerts: false,
    },
    coverage: {
      countries: ['IN'],
      marketplaces: [config.marketplaceId],
    },
    enabled: false,
    disabledReason: config.disabledReason,
  };
}

export const AMAZON_IN_SOURCE = pendingSource({
  id: 'amazon-in',
  displayName: 'Amazon India',
  kind: 'marketplace_api',
  marketplaceId: 'amazon',
  note: 'Associates participation rules bar price tracking/alerting sites and restrict comparison use; written approval is required.',
  disabledReason:
    'No written permission. The Associates Creators API must not be used for aggregation or a comparison product without Amazon approval.',
});

export const FLIPKART_IN_SOURCE = pendingSource({
  id: 'flipkart-in',
  displayName: 'Flipkart',
  kind: 'affiliate_feed',
  marketplaceId: 'flipkart',
  note: 'Affiliate API Terms prohibit use in a similar or competitive platform; written clarification is required.',
  disabledReason:
    'No written permission. The Flipkart Affiliate API and price display terms need confirmation before any integration.',
});

/** A disabled adapter can report coverage, but it can never produce an offer. */
function disabledAdapter(source: MarketSource): MarketSourceAdapter {
  return {
    source,
    isEnabled: false,
    async fetchOffers(
      _productId: string,
      _context: SourceFetchContext,
    ): Promise<SourceFetchResult> {
      throw new Error(`Source "${source.id}" is disabled and must not be queried`);
    },
  };
}

export function createPendingSourceAdapters(): readonly MarketSourceAdapter[] {
  return [disabledAdapter(AMAZON_IN_SOURCE), disabledAdapter(FLIPKART_IN_SOURCE)];
}
