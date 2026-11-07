import { describe, expect, it } from 'vitest';
import { demoProducts, offerSnapshotSchema, type OfferSnapshot } from '@smart-shopping/shared';

import {
  createDemoSourceAdapter,
  DEMO_SOURCE,
  DEMO_SOURCE_ID,
} from '../src/services/sources/demoSource.js';
import { createPendingSourceAdapters } from '../src/services/sources/pendingSources.js';

const NOW = new Date('2026-11-06T10:00:00.000Z');
const product = demoProducts[0];

if (!product) throw new Error('demo catalogue is empty');

describe('demo source adapter', () => {
  const adapter = createDemoSourceAdapter({ now: () => NOW });

  it('produces contract-valid snapshots for every catalogue offer', async () => {
    const result = await adapter.fetchOffers(product.id, { now: NOW });

    expect(result.snapshots).toHaveLength(product.offers.length);
    for (const snapshot of result.snapshots) {
      expect(offerSnapshotSchema.safeParse(snapshot).success).toBe(true);
      expect(snapshot.sourceId).toBe(DEMO_SOURCE_ID);
      expect(snapshot.productId).toBe(product.id);
    }
  });

  it('is deterministic for a fixed clock', async () => {
    const first = await adapter.fetchOffers(product.id, { now: NOW });
    const second = await adapter.fetchOffers(product.id, { now: NOW });

    expect(first.snapshots).toEqual(second.snapshots);
  });

  it('marks itself as sample data and disables alerts', () => {
    expect(DEMO_SOURCE.verification).toBe('sample');
    expect(DEMO_SOURCE.permission.permitsPriceAlerts).toBe(false);
    expect(DEMO_SOURCE.kind).toBe('demo');
  });

  it('keeps every observation inside its own TTL so demo prices are fresh', async () => {
    const result = await adapter.fetchOffers(product.id, { now: NOW });

    for (const snapshot of result.snapshots) {
      const ageMs = NOW.getTime() - Date.parse(snapshot.capturedAt);
      expect(ageMs).toBeGreaterThan(0);
      expect(ageMs).toBeLessThan(snapshot.ttlSeconds * 1000);
    }
  });

  it('maps stock state instead of inventing availability', async () => {
    const result = await adapter.fetchOffers(product.id, { now: NOW });
    const byMarketplace = new Map<string, OfferSnapshot>(
      result.snapshots.map((snapshot) => [snapshot.marketplaceId, snapshot]),
    );

    for (const offer of product.offers) {
      expect(byMarketplace.get(offer.marketplaceId)?.availability).toBe(
        offer.inStock ? 'in_stock' : 'out_of_stock',
      );
    }
  });

  it('returns nothing for an unknown product and says so', async () => {
    const result = await adapter.fetchOffers('not-in-the-catalogue', { now: NOW });

    expect(result.snapshots).toHaveLength(0);
    expect(result.warnings.join(' ')).toMatch(/no product/i);
  });
});

describe('disabled marketplace adapters', () => {
  const [amazon, flipkart] = createPendingSourceAdapters();

  it('exist only to report coverage', () => {
    expect(amazon?.isEnabled).toBe(false);
    expect(amazon?.source.id).toBe('amazon-in');
    expect(amazon?.source.permission.status).toBe('pending');
    expect(flipkart?.source.id).toBe('flipkart-in');
    expect(flipkart?.source.permission.permitsPriceAlerts).toBe(false);
  });

  it('refuse to be queried, so no request can be made without permission', async () => {
    await expect(amazon!.fetchOffers(product.id, { now: NOW })).rejects.toThrow(/disabled/i);
    await expect(flipkart!.fetchOffers(product.id, { now: NOW })).rejects.toThrow(/disabled/i);
  });
});
