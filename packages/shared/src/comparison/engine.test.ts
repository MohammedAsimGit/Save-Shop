import { describe, expect, it } from 'vitest';

import type { MarketSource } from '../contracts/comparison.js';
import { compareOffers } from './engine.js';

const NOW = new Date('2026-11-06T10:00:00.000Z');

const sampleSource: MarketSource = {
  id: 'sample-source',
  displayName: 'Sample source',
  kind: 'demo',
  verification: 'sample',
  attribution: { label: 'Invented prices' },
  permission: { status: 'granted', permitsPriceAlerts: false },
  coverage: { countries: ['IN'], marketplaces: ['market-a'] },
  enabled: true,
};

const verifiedSource: MarketSource = {
  id: 'verified-source',
  displayName: 'Verified source',
  kind: 'affiliate_feed',
  verification: 'verified',
  attribution: { label: 'Authorised feed' },
  permission: { status: 'granted', permitsPriceAlerts: false },
  coverage: { countries: ['IN'], marketplaces: ['market-b'] },
  enabled: true,
};

interface SnapshotOverrides {
  readonly sourceId?: string;
  readonly marketplaceId?: string;
  readonly amountMinor?: number;
  readonly currency?: string;
  readonly availability?: 'in_stock' | 'out_of_stock' | 'preorder' | 'unknown';
  readonly capturedAt?: string;
  readonly ttlSeconds?: number;
  readonly productId?: string;
}

function snapshot(overrides: SnapshotOverrides = {}) {
  return {
    productId: overrides.productId ?? 'product-1',
    marketplaceId: overrides.marketplaceId ?? 'market-a',
    sourceId: overrides.sourceId ?? 'sample-source',
    productUrl: 'https://example.com/product-1',
    price: {
      amountMinor: overrides.amountMinor ?? 10_000,
      currency: overrides.currency ?? 'INR',
    },
    availability: overrides.availability ?? 'in_stock',
    capturedAt: overrides.capturedAt ?? '2026-11-06T09:59:00.000Z',
    ttlSeconds: overrides.ttlSeconds ?? 900,
    attribution: { label: 'Invented prices' },
  };
}

const baseParams = {
  sources: [sampleSource],
  currency: 'INR',
  now: NOW,
} as const;

describe('compareOffers', () => {
  it('sorts eligible offers cheapest first and marks only one as lowest', () => {
    const result = compareOffers({
      ...baseParams,
      snapshots: [
        snapshot({ marketplaceId: 'market-a', amountMinor: 13_000 }),
        snapshot({ marketplaceId: 'market-a', amountMinor: 9_000 }),
        snapshot({ marketplaceId: 'market-a', amountMinor: 11_000 }),
      ],
    });

    expect(result.offers.map((offer) => offer.price.amountMinor)).toEqual([9_000, 11_000, 13_000]);
    expect(result.offers.filter((offer) => offer.isLowest)).toHaveLength(1);
    expect(result.lowest?.price.amountMinor).toBe(9_000);
  });

  it('never reports a sample price as verified', () => {
    const result = compareOffers({ ...baseParams, snapshots: [snapshot()] });

    expect(result.status).toBe('sample_only');
    expect(result.lowest).not.toBeNull();
    expect(result.lowestVerified).toBeNull();
    expect(result.offers[0]?.isVerified).toBe(false);
    expect(result.notices.join(' ')).toMatch(/sample/i);
  });

  it('selects the lowest eligible offer as lowestVerified when an authorised source is present', () => {
    const result = compareOffers({
      sources: [sampleSource, verifiedSource],
      currency: 'INR',
      now: NOW,
      snapshots: [
        snapshot({ amountMinor: 8_000 }),
        snapshot({ sourceId: 'verified-source', marketplaceId: 'market-b', amountMinor: 9_500 }),
        snapshot({ sourceId: 'verified-source', marketplaceId: 'market-b', amountMinor: 10_500 }),
      ],
    });

    expect(result.status).toBe('verified');
    expect(result.lowest?.price.amountMinor).toBe(8_000);
    // The cheapest eligible offer is sample data, so the verified claim must not attach to it.
    expect(result.lowestVerified?.price.amountMinor).toBe(9_500);
  });

  it('excludes a price in another currency instead of converting it', () => {
    const result = compareOffers({
      ...baseParams,
      snapshots: [snapshot(), snapshot({ amountMinor: 500, currency: 'USD' })],
    });

    expect(result.offers).toHaveLength(1);
    expect(result.excluded.map((entry) => entry.reason)).toEqual(['currency_mismatch']);
  });

  it('excludes an observation older than its TTL and explains why', () => {
    const result = compareOffers({
      ...baseParams,
      snapshots: [
        snapshot({ capturedAt: '2026-11-06T08:00:00.000Z', ttlSeconds: 900 }),
        snapshot({ amountMinor: 12_000 }),
      ],
    });

    expect(result.offers).toHaveLength(1);
    expect(result.excluded[0]?.reason).toBe('stale');
    expect(result.notices.join(' ')).toMatch(/freshness limit/i);
  });

  it('excludes offers that are not in stock', () => {
    const result = compareOffers({
      ...baseParams,
      snapshots: [
        snapshot({ availability: 'out_of_stock', amountMinor: 100 }),
        snapshot({ availability: 'preorder', amountMinor: 200 }),
        snapshot({ availability: 'unknown', amountMinor: 300 }),
        snapshot({ amountMinor: 400 }),
      ],
    });

    expect(result.offers.map((offer) => offer.price.amountMinor)).toEqual([400]);
    expect(result.excluded.filter((entry) => entry.reason === 'unavailable')).toHaveLength(3);
  });

  it('returns no_offers when the only observation is stale', () => {
    const result = compareOffers({
      ...baseParams,
      snapshots: [snapshot({ capturedAt: '2026-11-01T08:00:00.000Z' })],
    });

    expect(result.status).toBe('no_offers');
    expect(result.lowest).toBeNull();
    expect(result.notices.join(' ')).toMatch(/no eligible offer/i);
  });

  it('rejects invalid snapshots without throwing', () => {
    const result = compareOffers({
      ...baseParams,
      snapshots: [
        { productId: 'product-1', price: 'free' },
        snapshot({ amountMinor: 1_299 }),
        snapshot({ amountMinor: 1_499.5 }),
      ],
    });

    expect(result.offers).toHaveLength(1);
    expect(result.excluded.filter((entry) => entry.reason === 'invalid')).toHaveLength(2);
  });

  it('excludes offers from an unregistered source', () => {
    const result = compareOffers({
      ...baseParams,
      snapshots: [snapshot({ sourceId: 'unknown-source' })],
    });

    expect(result.offers).toHaveLength(0);
    expect(result.excluded[0]?.reason).toBe('unknown_source');
  });

  it('rejects an observation timestamped in the future', () => {
    const result = compareOffers({
      ...baseParams,
      snapshots: [snapshot({ capturedAt: '2026-11-06T12:00:00.000Z' })],
    });

    expect(result.offers).toHaveLength(0);
    expect(result.excluded[0]?.reason).toBe('future_timestamp');
  });

  it('is deterministic: identical input produces identical ordering', () => {
    const params = {
      ...baseParams,
      snapshots: [
        snapshot({ amountMinor: 9_000, capturedAt: '2026-11-06T09:58:00.000Z' }),
        snapshot({ amountMinor: 9_000, capturedAt: '2026-11-06T09:57:00.000Z' }),
      ],
    };

    const first = compareOffers(params);
    const second = compareOffers(params);

    expect(first.offers.map((offer) => offer.capturedAt)).toEqual(
      second.offers.map((offer) => offer.capturedAt),
    );
    // Equal prices: the fresher observation ranks first.
    expect(first.offers[0]?.capturedAt).toBe('2026-11-06T09:58:00.000Z');
  });

  it('only compares offers for the requested product', () => {
    const result = compareOffers({
      ...baseParams,
      productId: 'product-1',
      snapshots: [snapshot(), snapshot({ productId: 'product-2', amountMinor: 1 })],
    });

    expect(result.offers).toHaveLength(1);
    expect(result.excluded[0]?.reason).toBe('invalid');
  });
});
