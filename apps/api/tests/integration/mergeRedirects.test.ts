import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { CanonicalProduct } from '@smart-shopping/shared';

import { CanonicalProductModel } from '../../src/models/canonicalProduct.js';
import { createMemoryAdminStore } from '../../src/services/admin/adminStore.js';
import type { AdminActor } from '../../src/services/admin/auth.service.js';
import { createMergeService } from '../../src/services/admin/merge.service.js';
import { createMemoryComparisonCache } from '../../src/services/cache/memoryComparisonCache.js';
import { createCatalogueService } from '../../src/services/catalogue/catalogue.service.js';
import type { CatalogueStore } from '../../src/services/catalogue/catalogueStore.js';
import { createIdentityMatcher } from '../../src/services/catalogue/matching.service.js';
import { createMongoCatalogueStore } from '../../src/services/catalogue/mongoCatalogueStore.js';
import { createProductIdentityResolver } from '../../src/services/catalogue/productIdentity.js';
import { createComparisonService } from '../../src/services/comparison.service.js';
import { createHistoryService } from '../../src/services/history.service.js';
import { createMongoRollupStore } from '../../src/services/rollups/mongoRollupStore.js';
import { rollupKey, type RollupRecord } from '../../src/services/rollups/rollupStore.js';
import { createMongoSnapshotStore } from '../../src/services/snapshots/mongoSnapshotStore.js';
import { makeProduct } from '../helpers/catalogue.js';
import { VERIFIED_SOURCE, makeAdapter, makeSnapshot } from '../helpers/snapshots.js';
import { resetTestDatabase, startTestDatabase, type TestDatabase } from './helpers/replicaSet.js';

/**
 * Merged-product reads against real MongoDB persistence.
 *
 * The archived id must resolve to the survivor for comparison and history reads, and
 * new observations must be written under the survivor. These tests use the real
 * catalogue/comparison/history services over real Mongo stores; only the price
 * source adapter is a double, because no marketplace is integrated.
 */

const ACTOR: AdminActor = {
  id: 'admin-integration',
  email: 'ops@example.com',
  displayName: 'Operations',
  role: 'catalogue_admin',
};

const NOW = new Date('2026-11-09T12:00:00.000Z');
const SOURCE = 'redirect-source';
const TARGET = 'redirect-target';

let database: TestDatabase;

interface Harness {
  readonly catalogue: CatalogueStore;
  readonly resolveProduct: ReturnType<typeof createProductIdentityResolver>;
}

function products(): CanonicalProduct[] {
  return [
    makeProduct({
      id: TARGET,
      name: 'WH-1000XM5 Wireless Headphones',
      brand: 'Sony',
      model: 'WH-1000XM5',
      category: 'audio',
    }),
    makeProduct({
      id: SOURCE,
      name: 'WH-1000XM5 Wireless Headphones',
      brand: 'Sony',
      model: 'WH-1000XM5',
      category: 'audio',
    }),
  ];
}

function rollup(productId: string, dateKey: string): RollupRecord {
  const parts = {
    productId,
    sourceId: VERIFIED_SOURCE.id,
    marketplaceId: 'amazon',
    currency: 'INR',
    sourceVerification: 'verified' as const,
    dateKey,
  };

  return {
    rollupKey: rollupKey(parts),
    ...parts,
    date: new Date(`${dateKey}T00:00:00.000Z`),
    windowStart: new Date(`${dateKey}T00:00:00.000Z`),
    windowEnd: new Date(`${dateKey}T23:59:59.999Z`),
    minPrice: { amountMinor: 2_000_000, currency: 'INR' },
    maxPrice: { amountMinor: 2_100_000, currency: 'INR' },
    firstPrice: { amountMinor: 2_050_000, currency: 'INR' },
    lastPrice: { amountMinor: 2_000_000, currency: 'INR' },
    observationCount: 3,
    availabilityCounts: { inStock: 3, outOfStock: 0, preorder: 0, unknown: 0 },
    isSample: false,
    generatedAt: NOW,
  };
}

function buildHarness(): Harness {
  const catalogue = createMongoCatalogueStore();
  const matcher = createIdentityMatcher({ store: catalogue });
  const catalogueService = createCatalogueService({ store: catalogue, matcher });

  return {
    catalogue,
    resolveProduct: createProductIdentityResolver(catalogueService),
  };
}

async function seedAndMerge(h: Harness) {
  const snapshots = createMongoSnapshotStore();
  const rollups = createMongoRollupStore();

  await h.catalogue.upsertProducts(products());
  await snapshots.saveMany(
    [
      makeSnapshot({ productId: TARGET, capturedAt: '2026-11-05T05:00:00.000Z' }),
      makeSnapshot({
        productId: TARGET,
        capturedAt: '2026-11-06T05:00:00.000Z',
        price: { amountMinor: 2_550_000, currency: 'INR' },
      }),
    ],
    { sources: [VERIFIED_SOURCE], now: NOW, includeSampleSources: true },
  );
  await rollups.insertMany([rollup(TARGET, '2026-11-01')]);

  // Snapshot and rollup stores are intentionally empty for the source: the merge
  // moves any that exist, and history must read the survivor's rows either way.
  await snapshots.saveMany(
    [makeSnapshot({ productId: SOURCE, capturedAt: '2026-11-05T06:00:00.000Z' })],
    { sources: [VERIFIED_SOURCE], now: NOW, includeSampleSources: true },
  );

  const merge = createMergeService({
    catalogue: h.catalogue,
    snapshots,
    rollups,
    adminStore: createMemoryAdminStore(),
    now: () => NOW,
  });

  const result = await merge.merge({
    sourceProductId: SOURCE,
    targetProductId: TARGET,
    reason: 'two records for the same headphones',
    confirmConflicts: false,
    actor: ACTOR,
  });

  expect(result.transactionUsed).toBe(true);
  return { snapshots, rollups, merge, result };
}

beforeAll(async () => {
  database = await startTestDatabase();
}, 240_000);

afterAll(async () => {
  await database.stop();
}, 120_000);

beforeEach(async () => {
  await resetTestDatabase(database.databaseName);
});

describe('merged product redirects with real persistence', () => {
  it('resolves the archived id and serves its history from the survivor', async () => {
    const h = buildHarness();
    const { snapshots, rollups } = await seedAndMerge(h);

    const resolved = await h.resolveProduct(SOURCE);
    expect(resolved).toMatchObject({ id: TARGET, canonical: true });

    const history = createHistoryService({
      store: snapshots,
      rollupStore: rollups,
      sources: [VERIFIED_SOURCE],
      resolveProduct: h.resolveProduct,
      now: () => NOW,
    });

    const response = await history.getHistory(SOURCE, { period: '30d', limit: 200 });

    expect(response.productId).toBe(TARGET);
    expect(response.observations.length).toBe(3);
    expect(response.observations.every((entry) => entry.productId === TARGET)).toBe(true);
    expect(response.rollups).toHaveLength(1);
    expect(response.rollups[0]?.productId).toBe(TARGET);
    expect(response.rollups[0]?.date).toBe('2026-11-01');
  });

  it('compares through the survivor, caches under the survivor and persists there', async () => {
    const h = buildHarness();
    const { snapshots } = await seedAndMerge(h);

    const requested: string[] = [];
    const adapter = makeAdapter(VERIFIED_SOURCE, async (productId) => {
      requested.push(productId);
      return {
        snapshots: [
          makeSnapshot({
            productId,
            sourceId: VERIFIED_SOURCE.id,
            capturedAt: NOW.toISOString(),
            price: { amountMinor: 2_450_000, currency: 'INR' },
          }),
        ],
        warnings: [],
      };
    });

    const cache = createMemoryComparisonCache(() => NOW);
    const comparison = createComparisonService({
      adapters: [adapter.adapter],
      cache,
      snapshotStore: snapshots,
      resolveProduct: h.resolveProduct,
      now: () => NOW,
      cacheTtlSeconds: 300,
    });

    const archived = await comparison.getComparison(SOURCE);
    expect(archived.productId).toBe(TARGET);
    expect(archived.product.id).toBe(TARGET);
    expect(requested).toEqual([TARGET]);

    // The cache was written under the survivor, so the surviving id is a cache hit
    // and the archived id can never produce a stale source-product result.
    const survivor = await comparison.getComparison(TARGET);
    expect(survivor.productId).toBe(TARGET);
    expect(requested).toEqual([TARGET]);

    expect(await snapshots.countForProduct(SOURCE)).toBe(0);
    // Two seeded for the survivor, one moved from the source, one new observation:
    // all four are stored against the survivor.
    expect(await snapshots.countForProduct(TARGET)).toBe(4);
  });

  it('follows several redirect hops to the final survivor', async () => {
    const h = buildHarness();
    await h.catalogue.upsertProducts([
      ...products(),
      makeProduct({
        id: 'hop-a',
        name: 'WH-1000XM4 Wireless Headphones',
        brand: 'Sony',
        model: 'WH-1000XM4',
      }),
      makeProduct({
        id: 'hop-b',
        name: 'WH-1000XM4 Wireless Headphones',
        brand: 'Sony',
        model: 'WH-1000XM4',
      }),
      makeProduct({
        id: 'hop-c',
        name: 'WH-1000XM4 Wireless Headphones',
        brand: 'Sony',
        model: 'WH-1000XM4',
      }),
    ]);

    // Legacy chain: an older merge redirected A into B, a later one B into C.
    await CanonicalProductModel.updateOne(
      { id: 'hop-a' },
      { $set: { status: 'archived', mergedInto: 'hop-b' } },
    );
    await CanonicalProductModel.updateOne(
      { id: 'hop-b' },
      { $set: { status: 'archived', mergedInto: 'hop-c' } },
    );

    const resolved = await h.resolveProduct('hop-a');
    expect(resolved?.id).toBe('hop-c');
  });

  it('terminates on a malformed circular redirect instead of looping forever', async () => {
    const h = buildHarness();
    await h.catalogue.upsertProducts(products());

    await CanonicalProductModel.updateOne(
      { id: SOURCE },
      { $set: { status: 'archived', mergedInto: TARGET } },
    );
    await CanonicalProductModel.updateOne(
      { id: TARGET },
      { $set: { status: 'archived', mergedInto: SOURCE } },
    );

    const resolved = await h.resolveProduct(SOURCE);
    expect(resolved).not.toBeNull();
    expect([SOURCE, TARGET]).toContain(resolved?.id);

    const merge = createMergeService({
      catalogue: h.catalogue,
      snapshots: createMongoSnapshotStore(),
      rollups: createMongoRollupStore(),
      adminStore: createMemoryAdminStore(),
      now: () => NOW,
    });

    // A circular merge is refused by the assessment, never attempted.
    await expect(
      merge.merge({
        sourceProductId: SOURCE,
        targetProductId: TARGET,
        reason: 'circular fixture',
        confirmConflicts: true,
        actor: ACTOR,
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});
