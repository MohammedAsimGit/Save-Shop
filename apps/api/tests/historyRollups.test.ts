import { describe, expect, it } from 'vitest';

import { demoProducts, priceHistoryResponseSchema } from '@smart-shopping/shared';

import { createHistoryService } from '../src/services/history.service.js';
import { createMemoryRollupStore } from '../src/services/rollups/memoryRollupStore.js';
import type { RollupRecord } from '../src/services/rollups/rollupStore.js';
import { createMemorySnapshotStore } from '../src/services/snapshots/memorySnapshotStore.js';
import { SAMPLE_SOURCE, VERIFIED_SOURCE } from './helpers/snapshots.js';

/**
 * Archived rollups inside the history API.
 *
 * The contract rule under test: an aggregate is *never* an observation. It lives
 * in its own array, is flagged `aggregated: true`, and a fully compacted window
 * still reports an honest status instead of pretending there is no history.
 */

const NOW = new Date('2026-12-01T12:00:00.000Z');
const PRODUCT = demoProducts[0]!;
const SOURCES = [VERIFIED_SOURCE, SAMPLE_SOURCE];

function makeRollup(overrides: Partial<RollupRecord> = {}): RollupRecord {
  const dateKey = overrides.dateKey ?? '2026-11-10';
  const date = new Date(`${dateKey}T00:00:00.000Z`);

  return {
    rollupKey: `rollup-${dateKey}-${overrides.sourceId ?? VERIFIED_SOURCE.id}`,
    productId: PRODUCT.id,
    sourceId: VERIFIED_SOURCE.id,
    marketplaceId: 'amazon',
    currency: 'INR',
    dateKey,
    date,
    windowStart: date,
    windowEnd: new Date(date.getTime() + 86_400_000),
    minPrice: { amountMinor: 2_500_000, currency: 'INR' },
    maxPrice: { amountMinor: 2_900_000, currency: 'INR' },
    firstPrice: { amountMinor: 2_900_000, currency: 'INR' },
    lastPrice: { amountMinor: 2_500_000, currency: 'INR' },
    observationCount: 4,
    availabilityCounts: { inStock: 3, outOfStock: 1, preorder: 0, unknown: 0 },
    sourceVerification: 'verified',
    isSample: false,
    generatedAt: NOW,
    ...overrides,
  };
}

function service(rollups: readonly RollupRecord[]) {
  return createHistoryService({
    store: createMemorySnapshotStore(),
    rollupStore: createMemoryRollupStore(rollups),
    sources: SOURCES,
    now: () => NOW,
  });
}

const QUERY = { period: '30d' as const, limit: 200 };

describe('history API with archived rollups', () => {
  it('reports a fully compacted window as archived, not as no history', async () => {
    const history = await service([makeRollup()]).getHistory(PRODUCT.id, QUERY);

    expect(priceHistoryResponseSchema.safeParse(history).success).toBe(true);
    expect(history.observations).toEqual([]);
    expect(history.rollups).toHaveLength(1);
    expect(history.status).toBe('verified');

    const rollup = history.rollups[0]!;
    expect(rollup.aggregated).toBe(true);
    expect(rollup.date).toBe('2026-11-10');
    expect(rollup.minPrice.amountMinor).toBe(2_500_000);
    expect(rollup.maxPrice.amountMinor).toBe(2_900_000);
    expect(rollup.firstPrice.amountMinor).toBe(2_900_000);
    expect(rollup.lastPrice.amountMinor).toBe(2_500_000);
    expect(rollup.observationCount).toBe(4);
    expect(rollup.availabilityCounts.inStock).toBe(3);
    expect(rollup.source.id).toBe(VERIFIED_SOURCE.id);
    expect(history.notices.join(' ')).toMatch(/archived daily summaries/i);
    expect(history.notices.join(' ')).toMatch(/compacted/i);
  });

  it('keeps verified and sample aggregates apart and marks the window mixed', async () => {
    const history = await service([
      makeRollup(),
      makeRollup({
        rollupKey: 'sample-rollup',
        sourceId: SAMPLE_SOURCE.id,
        marketplaceId: 'flipkart',
        sourceVerification: 'sample',
        isSample: true,
        minPrice: { amountMinor: 1_000, currency: 'INR' },
        maxPrice: { amountMinor: 1_500, currency: 'INR' },
        firstPrice: { amountMinor: 1_000, currency: 'INR' },
        lastPrice: { amountMinor: 1_500, currency: 'INR' },
        observationCount: 1,
      }),
    ]).getHistory(PRODUCT.id, QUERY);

    expect(history.status).toBe('mixed');
    expect(history.summary.verified.count).toBe(0);
    expect(history.summary.sample.count).toBe(0);

    const sample = history.rollups.find((rollup) => rollup.isSample);
    const verified = history.rollups.find((rollup) => !rollup.isSample);
    expect(sample?.sourceVerification).toBe('sample');
    expect(verified?.minPrice.amountMinor).toBe(2_500_000);
    // A cheaper sample aggregate never lowers the verified one.
    expect(verified?.minPrice.amountMinor).not.toBe(1_000);
  });

  it('never mixes currencies and says that it excluded them', async () => {
    const history = await service([
      makeRollup(),
      makeRollup({
        rollupKey: 'usd-rollup',
        currency: 'USD',
        minPrice: { amountMinor: 32_000, currency: 'USD' },
        maxPrice: { amountMinor: 33_000, currency: 'USD' },
        firstPrice: { amountMinor: 32_000, currency: 'USD' },
        lastPrice: { amountMinor: 33_000, currency: 'USD' },
      }),
    ]).getHistory(PRODUCT.id, QUERY);

    expect(history.rollups).toHaveLength(1);
    expect(history.rollups.every((rollup) => rollup.currency === 'INR')).toBe(true);
    expect(history.notices.join(' ')).toMatch(/another currency/i);
  });

  it('applies the source and marketplace filters to archived days', async () => {
    const all = [
      makeRollup(),
      makeRollup({ rollupKey: 'flipkart-rollup', marketplaceId: 'flipkart' }),
    ];

    const byMarketplace = await service(all).getHistory(PRODUCT.id, {
      ...QUERY,
      marketplaceId: 'flipkart',
    });
    expect(byMarketplace.rollups).toHaveLength(1);
    expect(byMarketplace.rollups[0]?.marketplaceId).toBe('flipkart');

    const bySource = await service(all).getHistory(PRODUCT.id, {
      ...QUERY,
      sourceId: SAMPLE_SOURCE.id,
    });
    expect(bySource.rollups).toEqual([]);
  });

  it('excludes archived days outside the requested period', async () => {
    const history = await service([
      makeRollup({ dateKey: '2026-06-01', rollupKey: 'june-rollup' }),
      makeRollup({ dateKey: '2026-11-10' }),
    ]).getHistory(PRODUCT.id, QUERY);

    expect(history.rollups.map((rollup) => rollup.date)).toEqual(['2026-11-10']);
  });

  it('orders archived days chronologically and keeps the existing response shape', async () => {
    const history = await service([
      makeRollup({ dateKey: '2026-11-20', rollupKey: 'later' }),
      makeRollup({ dateKey: '2026-11-10', rollupKey: 'earlier' }),
    ]).getHistory(PRODUCT.id, QUERY);

    expect(history.rollups.map((rollup) => rollup.date)).toEqual(['2026-11-10', '2026-11-20']);
    // Sprint 3 fields are untouched.
    expect(history).toMatchObject({
      productId: PRODUCT.id,
      currency: 'INR',
      period: '30d',
      status: 'verified',
    });
    expect(history.summary.verified.count).toBe(0);
    expect(history.filters).toEqual({ sourceId: null, marketplaceId: null, limit: 200 });
  });

  it('accepts a payload without a rollups field for older clients', () => {
    const legacy = {
      productId: PRODUCT.id,
      product: { id: PRODUCT.id, title: PRODUCT.title, catalog: 'demo-catalog' },
      currency: 'INR',
      period: '30d',
      from: '2026-11-01T12:00:00.000Z',
      to: NOW.toISOString(),
      generatedAt: NOW.toISOString(),
      status: 'no_history',
      observations: [],
      summary: {
        verified: { count: 0, lowest: null, latest: null },
        sample: { count: 0, lowest: null, latest: null },
      },
      filters: { sourceId: null, marketplaceId: null, limit: 200 },
      notices: [],
    };

    const parsed = priceHistoryResponseSchema.safeParse(legacy);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.rollups).toEqual([]);
  });
});
