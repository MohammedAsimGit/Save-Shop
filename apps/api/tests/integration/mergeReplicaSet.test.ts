import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { CanonicalProduct, MergeRequest } from '@smart-shopping/shared';

import { CanonicalProductModel } from '../../src/models/canonicalProduct.js';
import { CatalogueMergeRunModel } from '../../src/models/catalogueMergeRun.js';
import { MarketplaceListingModel } from '../../src/models/marketplaceListing.js';
import { PriceDailyRollupModel } from '../../src/models/priceDailyRollup.js';
import { PriceSnapshotModel } from '../../src/models/priceSnapshot.js';
import type { AdminStore } from '../../src/services/admin/adminStore.js';
import { createMongoAdminStore } from '../../src/services/admin/mongoAdminStore.js';
import type { AdminActor } from '../../src/services/admin/auth.service.js';
import { createMergeService, type MergeService } from '../../src/services/admin/merge.service.js';
import {
  listingContentHash,
  type CatalogueStore,
  type StoredListing,
} from '../../src/services/catalogue/catalogueStore.js';
import { createMongoCatalogueStore } from '../../src/services/catalogue/mongoCatalogueStore.js';
import { createMongoRollupStore } from '../../src/services/rollups/mongoRollupStore.js';
import {
  rollupKey,
  type RollupRecord,
  type RollupStore,
} from '../../src/services/rollups/rollupStore.js';
import { createMongoSnapshotStore } from '../../src/services/snapshots/mongoSnapshotStore.js';
import type { SnapshotStore } from '../../src/services/snapshots/snapshotStore.js';
import { makeProduct } from '../helpers/catalogue.js';
import { VERIFIED_SOURCE, makeSnapshot } from '../helpers/snapshots.js';
import { resetTestDatabase, startTestDatabase, type TestDatabase } from './helpers/replicaSet.js';

/**
 * Transactional catalogue merge against a real MongoDB replica set.
 *
 * These tests exercise the real merge service and the real MongoDB repositories, so
 * a merge that reports `transactionUsed: true` really did commit a multi-document
 * transaction, and a simulated failure really was rolled back by the server.
 */

const ACTOR: AdminActor = {
  id: 'admin-integration',
  email: 'ops@example.com',
  displayName: 'Operations',
  role: 'catalogue_admin',
};

const NOW = new Date('2026-11-09T12:00:00.000Z');
const TARGET = 'merge-target';
const SOURCE = 'merge-source';
const VARIANT = 'merge-variant';
const OTHER_TARGET = 'other-target';
const SECOND_SOURCE = 'second-source';

let database: TestDatabase;

interface Harness {
  readonly catalogue: CatalogueStore;
  readonly snapshots: SnapshotStore;
  readonly rollups: RollupStore;
  readonly adminStore: AdminStore;
  readonly merge: MergeService;
}

function products(): CanonicalProduct[] {
  return [
    makeProduct({
      id: TARGET,
      name: 'WH-1000XM5 Wireless Headphones',
      brand: 'Sony',
      model: 'WH-1000XM5',
      category: 'audio',
      provenance: 'manual',
      isSample: false,
    }),
    makeProduct({
      id: SOURCE,
      name: 'WH-1000XM5 Wireless Headphones',
      brand: 'Sony',
      model: 'WH-1000XM5',
      category: 'audio',
      provenance: 'manual',
      isSample: false,
    }),
    makeProduct({
      id: VARIANT,
      name: 'WH-1000XM5 Wireless Headphones - Black',
      brand: 'Sony',
      model: 'WH-1000XM5',
      category: 'audio',
      variantOf: SOURCE,
      color: 'black',
    }),
    makeProduct({
      id: OTHER_TARGET,
      name: 'WH-1000XM5 Wireless Headphones',
      brand: 'Sony',
      model: 'WH-1000XM5',
      category: 'audio',
    }),
    makeProduct({
      id: SECOND_SOURCE,
      name: 'WH-1000XM5 Wireless Headphones',
      brand: 'Sony',
      model: 'WH-1000XM5',
      category: 'audio',
    }),
  ];
}

function listing(productId: string, externalId: string): StoredListing {
  const base = {
    id: `listing-${externalId}`,
    canonicalProductId: productId,
    sourceId: 'test-source',
    marketplaceId: 'amazon',
    externalId,
    title: 'Sony WH-1000XM5',
    url: `https://demo.saveshop.example/product/${externalId}`,
    brand: 'Sony',
    specifications: {},
    provenance: 'manual' as const,
    isSample: false,
    match: {
      status: 'strong' as const,
      method: 'brand_model' as const,
      confidence: 90,
      requiresReview: false,
      reasons: ['brand and model matched'],
    },
    revision: 0,
    review: null,
    lastObservedAt: NOW.toISOString(),
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
  };

  return { ...base, contentHash: listingContentHash(base) };
}

function rollup(
  productId: string,
  dateKey: string,
  overrides: Partial<RollupRecord> = {},
): RollupRecord {
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
    ...overrides,
  };
}

function mergeBody(overrides: Partial<MergeRequest> = {}): MergeRequest {
  return {
    sourceProductId: SOURCE,
    targetProductId: TARGET,
    reason: 'the two records describe the same headphones',
    confirmConflicts: false,
    ...overrides,
  };
}

function buildHarness(overrides: Partial<Harness> = {}): Harness {
  const catalogue = overrides.catalogue ?? createMongoCatalogueStore();
  const snapshots = overrides.snapshots ?? createMongoSnapshotStore();
  const rollups = overrides.rollups ?? createMongoRollupStore();
  const adminStore = overrides.adminStore ?? createMongoAdminStore();

  return {
    catalogue,
    snapshots,
    rollups,
    adminStore,
    merge:
      overrides.merge ??
      createMergeService({ catalogue, snapshots, rollups, adminStore, now: () => NOW }),
  };
}

/** Target already has the 06:00 observation; the source has an older one plus a duplicate. */
async function seed(h: Harness): Promise<void> {
  await h.catalogue.upsertProducts(products());
  await h.catalogue.upsertListings([listing(SOURCE, 'sku-source'), listing(TARGET, 'sku-target')]);
  await h.snapshots.saveMany(
    [
      makeSnapshot({ productId: SOURCE, capturedAt: '2026-11-01T05:00:00.000Z' }),
      makeSnapshot({
        productId: SOURCE,
        capturedAt: '2026-11-01T06:00:00.000Z',
        price: { amountMinor: 2_500_000, currency: 'INR' },
      }),
      makeSnapshot({
        productId: TARGET,
        capturedAt: '2026-11-01T06:00:00.000Z',
        price: { amountMinor: 2_500_000, currency: 'INR' },
      }),
    ],
    { sources: [VERIFIED_SOURCE], now: NOW, includeSampleSources: true },
  );
  await h.rollups.insertMany([
    rollup(SOURCE, '2026-11-01'),
    rollup(SOURCE, '2026-11-02'),
    rollup(TARGET, '2026-11-01'),
  ]);
}

async function counts() {
  const [products_, listings, snapshots, rollups, runs] = await Promise.all([
    CanonicalProductModel.countDocuments({}),
    MarketplaceListingModel.countDocuments({}),
    PriceSnapshotModel.countDocuments({}),
    PriceDailyRollupModel.countDocuments({}),
    CatalogueMergeRunModel.countDocuments({}),
  ]);
  return { products: products_, listings, snapshots, rollups, runs };
}

function pendingRun(id: string, targetProductId: string) {
  return {
    id,
    sourceProductId: SOURCE,
    targetProductId,
    status: 'pending' as const,
    reason: 'recovery fixture',
    notes: null,
    adminId: ACTOR.id,
    adminEmail: ACTOR.email,
    requestId: null,
    transactionUsed: false,
    acknowledgedConflicts: [] as string[],
    planned: {
      listings: 1,
      snapshots: 2,
      snapshotsDeduped: 0,
      rollups: 2,
      rollupsCombined: 0,
      variants: 1,
    },
    applied: null,
    failureReason: null,
    startedAt: NOW,
    finishedAt: null,
  };
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

describe('successful transactional merge', () => {
  it('commits inside a MongoDB transaction and preserves every catalogue reference', async () => {
    const h = buildHarness();
    await seed(h);
    const before = await counts();

    const result = await h.merge.merge({ ...mergeBody(), actor: ACTOR });

    expect(result.status).toBe('completed');
    expect(result.transactionUsed).toBe(true);
    expect(result.listingsMoved).toBe(1);
    expect(result.variantsRepointed).toBe(1);
    expect(result.snapshotsMoved).toBe(1);
    expect(result.snapshotsDeduped).toBe(1);
    expect(result.rollupsMoved).toBe(1);
    expect(result.rollupsCombined).toBe(1);

    const source = await h.catalogue.findProduct(SOURCE);
    expect(source).toMatchObject({ status: 'archived', mergedInto: TARGET });
    expect(source?.mergedAt).not.toBeNull();
    expect(source?.isSample).toBe(false);
    expect(source?.provenance).toBe('manual');

    const target = await h.catalogue.findProduct(TARGET);
    expect(target).toMatchObject({ status: 'active', mergedInto: null, isSample: false });

    const movedListing = await h.catalogue.findListing('listing-sku-source');
    expect(movedListing?.canonicalProductId).toBe(TARGET);

    const variant = await h.catalogue.findProduct(VARIANT);
    expect(variant?.variantOf).toBe(TARGET);

    expect(await h.snapshots.countForProduct(SOURCE)).toBe(0);
    expect(await h.snapshots.countForProduct(TARGET)).toBe(2);

    expect(await h.rollups.countForProduct(SOURCE)).toBe(0);
    expect(await h.rollups.countForProduct(TARGET)).toBe(2);
    const combined = await h.rollups.list({
      productId: TARGET,
      fromDate: '2026-11-01',
      toDate: '2026-11-01',
      limit: 10,
    });
    expect(combined).toHaveLength(1);
    expect(combined[0]?.observationCount).toBe(6);
    expect(combined[0]?.minPrice.amountMinor).toBe(2_000_000);
    expect(combined[0]?.maxPrice.amountMinor).toBe(2_100_000);

    const run = await h.adminStore.findMergeRun(result.mergeRunId);
    expect(run?.status).toBe('completed');
    expect(run?.transactionUsed).toBe(true);
    expect(run?.applied).toMatchObject({ listings: 1, snapshots: 1, snapshotsDeduped: 1 });

    // Nothing was invented or deleted: rows moved, two duplicates collapsed.
    const after = await counts();
    expect(after.products).toBe(before.products);
    expect(after.listings).toBe(before.listings);
    expect(after.snapshots).toBe(before.snapshots - 1);
    expect(after.rollups).toBe(before.rollups - 1);
    expect(after.runs).toBe(before.runs + 1);
  });
});

describe('transaction atomicity', () => {
  it('rolls back every reference move when a step fails inside the transaction', async () => {
    const h = buildHarness();
    await seed(h);
    const before = await counts();

    const failingSnapshots: SnapshotStore = {
      ...h.snapshots,
      async mergeProduct(options) {
        // Do the real work first, then fail: this is the strongest rollback test,
        // because listings, variants and snapshots have all been written inside the
        // transaction by the time the error surfaces.
        await h.snapshots.mergeProduct(options);
        throw new Error('injected failure after snapshot movement');
      },
    };

    const failing = buildHarness({ snapshots: failingSnapshots });
    await expect(failing.merge.merge({ ...mergeBody(), actor: ACTOR })).rejects.toMatchObject({
      statusCode: 500,
    });

    // Transaction-managed state is exactly as it was before the attempt.
    const source = await h.catalogue.findProduct(SOURCE);
    expect(source).toMatchObject({ status: 'active', mergedInto: null });
    expect((await h.catalogue.findListing('listing-sku-source'))?.canonicalProductId).toBe(SOURCE);
    expect((await h.catalogue.findProduct(VARIANT))?.variantOf).toBe(SOURCE);
    expect(await h.snapshots.countForProduct(SOURCE)).toBe(2);
    expect(await h.snapshots.countForProduct(TARGET)).toBe(1);
    expect(await h.rollups.countForProduct(SOURCE)).toBe(2);
    expect(await h.rollups.countForProduct(TARGET)).toBe(1);

    const afterFailure = await counts();
    expect(afterFailure.snapshots).toBe(before.snapshots);
    expect(afterFailure.rollups).toBe(before.rollups);

    const open = await h.adminStore.listOpenMergeRuns(10);
    expect(open).toHaveLength(1);
    expect(open[0]?.status).toBe('failed');
    expect(open[0]?.failureReason).toContain('injected failure');

    // The run is the recovery handle: repair re-applies the idempotent steps.
    const repaired = await h.merge.repairPendingMerges({ actor: ACTOR });
    expect(repaired).toMatchObject({ repaired: 1, failed: 0, remaining: 0 });

    expect((await h.catalogue.findProduct(SOURCE))?.mergedInto).toBe(TARGET);
    expect(await h.snapshots.countForProduct(SOURCE)).toBe(0);
    expect(await h.snapshots.countForProduct(TARGET)).toBe(2);
    expect(await h.rollups.countForProduct(TARGET)).toBe(2);
  });
});

describe('idempotency', () => {
  it('refuses a repeated merge without changing state or creating another run', async () => {
    const h = buildHarness();
    await seed(h);
    await h.merge.merge({ ...mergeBody(), actor: ACTOR });
    const afterFirst = await counts();

    await expect(h.merge.merge({ ...mergeBody(), actor: ACTOR })).rejects.toMatchObject({
      statusCode: 409,
    });

    const afterSecond = await counts();
    expect(afterSecond).toEqual(afterFirst);
    expect(await h.snapshots.countForProduct(TARGET)).toBe(2);
    expect(await h.rollups.countForProduct(TARGET)).toBe(2);
  });

  it('does not duplicate work when recovery runs repeatedly', async () => {
    const h = buildHarness();
    await seed(h);
    await h.merge.merge({ ...mergeBody(), actor: ACTOR });

    const first = await h.merge.repairPendingMerges({ actor: ACTOR });
    const second = await h.merge.repairPendingMerges({ actor: ACTOR });

    expect(first).toMatchObject({ repaired: 0, failed: 0, remaining: 0 });
    expect(second).toMatchObject({ repaired: 0, failed: 0, remaining: 0 });
    expect(await h.snapshots.countForProduct(TARGET)).toBe(2);
    expect(await h.rollups.countForProduct(TARGET)).toBe(2);
    expect(await MarketplaceListingModel.countDocuments({ canonicalProductId: SOURCE })).toBe(0);
  });
});

describe('concurrent merge attempts', () => {
  it('allows exactly one merge of the same source into different targets', async () => {
    const h = buildHarness();
    await seed(h);

    const [first, second] = await Promise.allSettled([
      h.merge.merge({ ...mergeBody({ targetProductId: TARGET }), actor: ACTOR }),
      h.merge.merge({ ...mergeBody({ targetProductId: OTHER_TARGET }), actor: ACTOR }),
    ]);

    const outcomes = [first, second];
    const fulfilled = outcomes.filter((outcome) => outcome.status === 'fulfilled');
    const rejected = outcomes.filter((outcome) => outcome.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({ statusCode: 409 });

    const winner = (fulfilled[0] as PromiseFulfilledResult<{ targetProductId: string }>).value;
    const source = await h.catalogue.findProduct(SOURCE);
    expect(source?.mergedInto).toBe(winner.targetProductId);
    expect(
      await MarketplaceListingModel.countDocuments({ canonicalProductId: winner.targetProductId }),
    ).toBe(2);
    expect(await MarketplaceListingModel.countDocuments({ canonicalProductId: SOURCE })).toBe(0);

    const loserTarget = winner.targetProductId === TARGET ? OTHER_TARGET : TARGET;
    expect(await MarketplaceListingModel.countDocuments({ canonicalProductId: loserTarget })).toBe(
      0,
    );
    expect(await PriceSnapshotModel.countDocuments({ productId: loserTarget })).toBe(0);
  });

  it('allows exactly one merge of the same source into the same target', async () => {
    const h = buildHarness();
    await seed(h);

    const results = await Promise.allSettled([
      h.merge.merge({ ...mergeBody(), actor: ACTOR }),
      h.merge.merge({ ...mergeBody(), actor: ACTOR }),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected && 'reason' in rejected ? rejected.reason : null).toMatchObject({
      statusCode: 409,
    });

    expect(await MarketplaceListingModel.countDocuments({ canonicalProductId: SOURCE })).toBe(0);
    expect(await PriceSnapshotModel.countDocuments({ productId: TARGET })).toBe(2);
    expect(await PriceDailyRollupModel.countDocuments({ productId: TARGET })).toBe(2);
  });

  it('merges two sources into one target without duplicating rows', async () => {
    const h = buildHarness();
    await seed(h);
    await h.catalogue.upsertListings([listing(SECOND_SOURCE, 'sku-second')]);
    await h.snapshots.saveMany(
      [
        makeSnapshot({
          productId: SECOND_SOURCE,
          capturedAt: '2026-11-03T05:00:00.000Z',
          price: { amountMinor: 2_400_000, currency: 'INR' },
        }),
      ],
      { sources: [VERIFIED_SOURCE], now: NOW, includeSampleSources: true },
    );

    const results = await Promise.allSettled([
      h.merge.merge({ ...mergeBody({ sourceProductId: SOURCE }), actor: ACTOR }),
      h.merge.merge({ ...mergeBody({ sourceProductId: SECOND_SOURCE }), actor: ACTOR }),
    ]);

    expect(results.some((result) => result.status === 'fulfilled')).toBe(true);

    // A write conflict may make one attempt fail; the run record is the recovery
    // handle, and repair must converge without duplicating anything.
    await h.merge.repairPendingMerges({ actor: ACTOR });

    expect((await h.catalogue.findProduct(SOURCE))?.mergedInto).toBe(TARGET);
    expect((await h.catalogue.findProduct(SECOND_SOURCE))?.mergedInto).toBe(TARGET);
    expect(await MarketplaceListingModel.countDocuments({ canonicalProductId: TARGET })).toBe(3);
    expect(await PriceSnapshotModel.countDocuments({ productId: TARGET })).toBe(3);

    const duplicated = await PriceSnapshotModel.aggregate<{ _id: string; count: number }>([
      { $group: { _id: '$observationKey', count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
    ]);
    expect(duplicated).toEqual([]);

    const duplicatedRollups = await PriceDailyRollupModel.aggregate<{
      _id: string;
      count: number;
    }>([{ $group: { _id: '$rollupKey', count: { $sum: 1 } } }, { $match: { count: { $gt: 1 } } }]);
    expect(duplicatedRollups).toEqual([]);
  });

  it('stays consistent when new observations arrive for the target during a merge', async () => {
    const h = buildHarness();
    await seed(h);

    const concurrentWrite = h.snapshots.saveMany(
      [
        makeSnapshot({
          productId: TARGET,
          capturedAt: '2026-11-04T05:00:00.000Z',
          price: { amountMinor: 2_300_000, currency: 'INR' },
        }),
      ],
      { sources: [VERIFIED_SOURCE], now: NOW, includeSampleSources: true },
    );

    const [mergeResult] = await Promise.all([
      h.merge.merge({ ...mergeBody(), actor: ACTOR }),
      concurrentWrite,
    ]);

    expect(mergeResult.transactionUsed).toBe(true);
    expect(await h.snapshots.countForProduct(TARGET)).toBe(3);

    const duplicated = await PriceSnapshotModel.aggregate<{ _id: string; count: number }>([
      { $group: { _id: '$observationKey', count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
    ]);
    expect(duplicated).toEqual([]);
  });
});

describe('recovery against real persistence', () => {
  it('detects and completes an unfinished run, then leaves it alone', async () => {
    const h = buildHarness();
    await seed(h);
    await h.adminStore.createMergeRun(pendingRun('run-recovery', TARGET));

    const first = await h.merge.repairPendingMerges({ actor: ACTOR });
    expect(first).toMatchObject({ repaired: 1, failed: 0, remaining: 0 });

    const run = await h.adminStore.findMergeRun('run-recovery');
    expect(run?.status).toBe('completed');
    expect((await h.catalogue.findProduct(SOURCE))?.mergedInto).toBe(TARGET);
    expect(await h.snapshots.countForProduct(TARGET)).toBe(2);
    expect(await h.rollups.countForProduct(TARGET)).toBe(2);

    const second = await h.merge.repairPendingMerges({ actor: ACTOR });
    expect(second).toMatchObject({ repaired: 0, failed: 0, remaining: 0 });
    expect(await h.snapshots.countForProduct(TARGET)).toBe(2);
    expect(await h.rollups.countForProduct(TARGET)).toBe(2);
  });

  it('completes a run that crashed after the source was archived', async () => {
    const h = buildHarness();
    await seed(h);
    await h.adminStore.createMergeRun(pendingRun('run-archived', TARGET));

    // Simulate a process that archived the source and moved listings, then died
    // before it could mark the run completed.
    await CanonicalProductModel.updateOne(
      { id: SOURCE },
      {
        $set: {
          status: 'archived',
          mergedInto: TARGET,
          mergedAt: NOW,
          mergeRunId: 'run-archived',
          updatedAt: NOW,
        },
      },
    );
    await MarketplaceListingModel.updateMany(
      { canonicalProductId: SOURCE },
      { $set: { canonicalProductId: TARGET } },
    );

    const repaired = await h.merge.repairPendingMerges({ actor: ACTOR });
    expect(repaired).toMatchObject({ repaired: 1, failed: 0, remaining: 0 });

    expect((await h.adminStore.findMergeRun('run-archived'))?.status).toBe('completed');
    expect(await h.snapshots.countForProduct(SOURCE)).toBe(0);
    expect(await h.snapshots.countForProduct(TARGET)).toBe(2);
    expect(await MarketplaceListingModel.countDocuments({ canonicalProductId: TARGET })).toBe(2);
  });

  it('refuses to redirect a source that already has a different final destination', async () => {
    const h = buildHarness();
    await seed(h);
    await h.merge.merge({ ...mergeBody(), actor: ACTOR });
    await h.adminStore.createMergeRun(pendingRun('run-stale', OTHER_TARGET));

    const repaired = await h.merge.repairPendingMerges({ actor: ACTOR });
    // The run cannot be completed without contradicting the real destination, so it
    // stays open (remaining: 1) and keeps reporting the conflict for an operator.
    expect(repaired).toMatchObject({ repaired: 0, failed: 1, remaining: 1 });

    expect((await h.catalogue.findProduct(SOURCE))?.mergedInto).toBe(TARGET);
    expect(await MarketplaceListingModel.countDocuments({ canonicalProductId: TARGET })).toBe(2);
    expect(await MarketplaceListingModel.countDocuments({ canonicalProductId: OTHER_TARGET })).toBe(
      0,
    );
  });
});
