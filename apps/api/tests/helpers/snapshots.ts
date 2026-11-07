import type { MarketSource, OfferSnapshot } from '@smart-shopping/shared';

import type {
  MarketSourceAdapter,
  SourceFetchContext,
  SourceFetchResult,
} from '../../src/services/sources/sourceAdapter.js';

/** A verified source exists only in tests; no real provider is integrated. */
export const VERIFIED_SOURCE: MarketSource = {
  id: 'test-verified-source',
  displayName: 'Test verified source',
  kind: 'licensed_feed',
  verification: 'verified',
  attribution: { label: 'Test verified source' },
  permission: { status: 'granted', permitsPriceAlerts: false },
  coverage: { countries: ['IN'], marketplaces: ['amazon'] },
  enabled: true,
};

/** Shaped like the demo source: enabled, but its numbers are invented. */
export const SAMPLE_SOURCE: MarketSource = {
  id: 'test-sample-source',
  displayName: 'Test sample source',
  kind: 'demo',
  verification: 'sample',
  attribution: { label: 'Test sample source - invented prices' },
  permission: { status: 'granted', permitsPriceAlerts: false },
  coverage: { countries: ['IN'], marketplaces: ['amazon'] },
  enabled: true,
};

export const DISABLED_SOURCE: MarketSource = {
  id: 'test-disabled-source',
  displayName: 'Test disabled source',
  kind: 'marketplace_api',
  verification: 'verified',
  attribution: { label: 'Test disabled source' },
  permission: { status: 'pending', permitsPriceAlerts: false },
  coverage: { countries: ['IN'], marketplaces: ['flipkart'] },
  enabled: false,
  disabledReason: 'No written permission.',
};

export function makeSnapshot(overrides: Partial<OfferSnapshot> = {}): OfferSnapshot {
  return {
    productId: 'sony-wh1000xm5',
    marketplaceId: 'amazon',
    sourceId: VERIFIED_SOURCE.id,
    productUrl: 'https://demo.saveshop.example/product/sony-wh1000xm5',
    price: { amountMinor: 2_699_000, currency: 'INR' },
    availability: 'in_stock',
    capturedAt: '2026-11-07T05:00:00.000Z',
    ttlSeconds: 3600,
    attribution: { label: 'Test verified source' },
    ...overrides,
  };
}

export interface AdapterHarness {
  readonly adapter: MarketSourceAdapter;
  readonly calls: () => number;
}

/** Adapter double: counts calls and returns whatever the supplied function yields. */
export function makeAdapter(
  source: MarketSource,
  fetch: (productId: string, context: SourceFetchContext) => Promise<SourceFetchResult>,
  isEnabled = source.enabled,
): AdapterHarness {
  let calls = 0;

  return {
    adapter: {
      source,
      isEnabled,
      async fetchOffers(productId, context) {
        calls += 1;
        return fetch(productId, context);
      },
    },
    calls: () => calls,
  };
}
