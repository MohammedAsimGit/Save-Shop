import { beforeEach, describe, expect, it } from 'vitest';

import type { CanonicalProduct, MergeRequest } from '@smart-shopping/shared';

import { createMemoryAdminStore, type AdminStore } from '../src/services/admin/adminStore.js';
import type { AdminActor } from '../src/services/admin/auth.service.js';
import { createMergeService, type MergeService } from '../src/services/admin/merge.service.js';
import { createMemoryCatalogueStore } from '../src/services/catalogue/memoryCatalogueStore.js';
import type { CatalogueStore } from '../src/services/catalogue/catalogueStore.js';
import { createMemoryRollupStore } from '../src/services/rollups/memoryRollupStore.js';
import {
  rollupKey,
  type RollupRecord,
  type RollupStore,
} from '../src/services/rollups/rollupStore.js';
import { createMemorySnapshotStore } from '../src/services/snapshots/memorySnapshotStore.js';
import type { SnapshotStore } from '../src/services/snapshots/snapshotStore.js';
import { makeProduct } from './helpers/catalogue.js';
import { VERIFIED_SOURCE, makeSnapshot } from './helpers/snapshots.js';

/**
 * Canonical product merge.
 *
 * These tests run against the in-memory stores, so they verify validation, ordering,
 * idempotent reference migration and recovery - but **not** MongoDB transaction
 * behaviour. MongoDB is not connected in this suite, which is exactly the fallback
 * path (`transactionUsed: false`) the service reports.
 */

const ACTOR: AdminActor = {
  id: 'admin-1',
  email: 'ops@example.com',
  displayName: 'Operations',
  role: 'catalogue_admin',
};

const NOW = new Date('2026-11-09T12:00:00.000Z');

function mergeBody(overrides: Partial<MergeRequest> = {}): MergeRequest {
  return {
    sourceProductId: 'duplicate-product',
    targetProductId: 'surviving-product',
    reason: 'the two records describe the same headphones',
    confirmConflicts: false,
    ...overrides,
  };
}

function rollup(productId: string, overrides: Partial<RollupRecord> = {}): RollupRecord {
  const parts = {
    productId,
    sourceId: VERIFIED_SOURCE.id,
    marketplaceId: 'amazon',
    currency: 'INR',
    sourceVerification: 'verified' as const,
    dateKey: '2026-11-01',
  };

  return {
    rollupKey: rollupKey(parts),
    ...parts,
    date: new Date('2026-11-01T00:00:00.000Z'),
    windowStart: new Date('2026-11-01T00:00:00.000Z'),
    windowEnd: new Date('2026-11-01T23:59:59.999Z'),
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

function products(): CanonicalProduct[] {
  return [
    makeProduct({
      id: 'surviving-product',
      name: 'WH-1000XM5 Wireless Headphones',
      brand: 'Sony',
      model: 'WH-1000XM5',
      category: 'audio',
    }),
    makeProduct({
      id: 'duplicate-product',
      name: 'WH-1000XM5 Wireless Headphones',
      brand: 'Sony',
      model: 'WH-1000XM5',
      category: 'audio',
    }),
  ];
}

interface Harness {
  readonly catalogue: CatalogueStore;
  readonly snapshots: SnapshotStore;
  readonly rollups: RollupStore;
  readonly adminStore: AdminStore;
  readonly merge: MergeService;
}

async function harness(): Promise<Harness> {
  const catalogue = createMemoryCatalogueStore();
  const snapshots = createMemorySnapshotStore();
  const rollups = createMemoryRollupStore();
  const adminStore = createMemoryAdminStore();

  await catalogue.upsertProducts(products());
  return {
    catalogue,
    snapshots,
    rollups,
    adminStore,
    merge: createMergeService({ catalogue, snapshots, rollups, adminStore, now: () => NOW }),
  };
}

async function seedReferences(catalogue: CatalogueStore, snapshots: SnapshotStore): Promise<void> {
  await catalogue.upsertListings([
    {
      id: 'listing-of-duplicate',
      canonicalProductId: 'duplicate-product',
      sourceId: 'test-source',
      marketplaceId: 'amazon',
      externalId: 'sku-1',
      title: 'Sony WH-1000XM5',
      url: 'https://demo.saveshop.example/product/sony-wh1000xm5',
      brand: 'Sony',
      specifications: {},
      provenance: 'manual',
      isSample: false,
      match: {
        status: 'strong',
        method: 'brand_model',
        confidence: 90,
        requiresReview: false,
        reasons: ['brand and model matched'],
      },
      revision: 0,
      review: null,
      lastObservedAt: NOW.toISOString(),
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
      contentHash: 'hash-1',
    },
  ]);

  // One observation exists only for the duplicate; another is identical to an
  // observation the target already has, so the merge must dedupe rather than
  // double the history.
  await snapshots.saveMany(
    [
      makeSnapshot({ productId: 'duplicate-product', capturedAt: '2026-11-01T05:00:00.000Z' }),
      makeSnapshot({
        productId: 'duplicate-product',
        capturedAt: '2026-11-01T06:00:00.000Z',
        price: { amountMinor: 2_500_000, currency: 'INR' },
      }),
      makeSnapshot({
        productId: 'surviving-product',
        capturedAt: '2026-11-01T06:00:00.000Z',
        price: { amountMinor: 2_500_000, currency: 'INR' },
      }),
    ],
    { sources: [VERIFIED_SOURCE], now: NOW, includeSampleSources: true },
  );
}

describe('merge validation', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await harness();
  });

  it('previews a compatible merge with the affected reference counts', async () => {
    await seedReferences(h.catalogue, h.snapshots);
    await h.rollups.insertMany([rollup('duplicate-product'), rollup('surviving-product')]);

    const preview = await h.merge.preview({
      sourceProductId: 'duplicate-product',
      targetProductId: 'surviving-product',
    });

    expect(preview.compatible).toBe(true);
    expect(preview.blockers).toEqual([]);
    expect(preview.conflicts).toEqual([]);
    expect(preview.summary).toEqual({ listings: 1, snapshots: 2, rollups: 1, variants: 0 });
  });

  it('refuses to merge different brands or categories', async () => {
    await h.catalogue.upsertProducts([
      makeProduct({
        id: 'other-brand',
        name: 'QuietComfort 45',
        brand: 'Bose',
        category: 'audio',
      }),
    ]);

    await expect(
      h.merge.merge({
        ...mergeBody({ targetProductId: 'other-brand' }),
        actor: ACTOR,
      }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'CONFLICT' });
  });

  it('refuses an unknown product and a self-merge', async () => {
    await expect(
      h.merge.merge({ ...mergeBody({ targetProductId: 'missing' }), actor: ACTOR }),
    ).rejects.toMatchObject({ statusCode: 404 });

    await expect(
      h.merge.merge({
        ...mergeBody({ targetProductId: 'duplicate-product' }),
        actor: ACTOR,
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('refuses to merge a base product into its own variant', async () => {
    await h.catalogue.upsertProducts([
      makeProduct({
        id: 'variant-product',
        name: 'WH-1000XM5 Wireless Headphones',
        brand: 'Sony',
        model: 'WH-1000XM5',
        category: 'audio',
        variantOf: 'duplicate-product',
      }),
    ]);

    const preview = await h.merge.preview({
      sourceProductId: 'duplicate-product',
      targetProductId: 'variant-product',
    });

    expect(preview.compatible).toBe(false);
    expect(preview.blockers.join(' ')).toMatch(/variant/i);
  });

  it('requires confirmation for conflicting variant attributes', async () => {
    await h.catalogue.upsertProducts([
      makeProduct({
        id: 'variant-conflict',
        name: 'WH-1000XM5 Wireless Headphones',
        brand: 'Sony',
        model: 'WH-1000XM5',
        category: 'audio',
        variantAttributes: { color: 'black' },
      }),
      makeProduct({
        id: 'duplicate-product',
        name: 'WH-1000XM5 Wireless Headphones',
        brand: 'Sony',
        model: 'WH-1000XM5',
        category: 'audio',
        variantAttributes: { color: 'silver' },
      }),
    ]);

    await expect(
      h.merge.merge({
        ...mergeBody({ targetProductId: 'variant-conflict' }),
        actor: ACTOR,
      }),
    ).rejects.toMatchObject({ statusCode: 409 });

    const confirmed = await h.merge.merge({
      ...mergeBody({ targetProductId: 'variant-conflict', confirmConflicts: true }),
      actor: ACTOR,
    });

    expect(confirmed.status).toBe('completed');
    expect(confirmed.acknowledgedConflicts.join(' ')).toMatch(/variant attributes/i);
  });
});

describe('merge execution', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await harness();
    await seedReferences(h.catalogue, h.snapshots);
    await h.rollups.insertMany([rollup('duplicate-product'), rollup('surviving-product')]);
  });

  it('moves listings, snapshots and rollups and archives the source', async () => {
    const result = await h.merge.merge({ ...mergeBody(), actor: ACTOR });

    expect(result.status).toBe('completed');
    expect(result.transactionUsed).toBe(false);
    expect(result.listingsMoved).toBe(1);
    expect(result.snapshotsMoved).toBe(1);
    expect(result.snapshotsDeduped).toBe(1);
    expect(result.variantsRepointed).toBe(0);

    const source = await h.catalogue.findProduct('duplicate-product');
    expect(source).toMatchObject({ status: 'archived', mergedInto: 'surviving-product' });
    expect(source?.mergedAt).not.toBeNull();

    const listing = await h.catalogue.findListing('listing-of-duplicate');
    expect(listing?.canonicalProductId).toBe('surviving-product');

    expect(await h.snapshots.countForProduct('duplicate-product')).toBe(0);
    expect(await h.snapshots.countForProduct('surviving-product')).toBe(2);

    expect(await h.rollups.countForProduct('duplicate-product')).toBe(0);
    // Combining two same-day rollups produces one row, not two: the counts add up.
    expect(await h.rollups.countForProduct('surviving-product')).toBe(1);
    const combined = await h.rollups.list({
      productId: 'surviving-product',
      fromDate: '2026-11-01',
      toDate: '2026-11-01',
      limit: 10,
    });
    expect(combined[0]?.observationCount).toBe(6);

    const run = await h.adminStore.findMergeRun(result.mergeRunId);
    expect(run?.status).toBe('completed');
    expect(run?.applied?.listings).toBe(1);
    expect(run?.transactionUsed).toBe(false);
  });

  it('records the merge in the audit trail', async () => {
    const result = await h.merge.merge({
      ...mergeBody({ reason: 'duplicate record from the demo import' }),
      actor: ACTOR,
      requestId: 'request-merge-1',
    });

    const { events } = await h.adminStore.listAudit({ page: 1, pageSize: 10 });
    const merged = events.find((event) => event.action === 'product.merged');

    expect(merged).toMatchObject({
      actorId: ACTOR.id,
      targetType: 'product',
      targetId: 'duplicate-product',
      requestId: 'request-merge-1',
      reason: 'duplicate record from the demo import',
    });
    expect(merged?.newState).toMatchObject({
      mergedInto: 'surviving-product',
      mergeRunId: result.mergeRunId,
    });
    expect(merged?.previousState).toMatchObject({ sourceStatus: 'active' });
  });

  it('refuses a repeated or circular merge', async () => {
    await h.merge.merge({ ...mergeBody(), actor: ACTOR });

    await expect(h.merge.merge({ ...mergeBody(), actor: ACTOR })).rejects.toMatchObject({
      statusCode: 409,
    });

    await expect(
      h.merge.merge({
        ...mergeBody({
          sourceProductId: 'surviving-product',
          targetProductId: 'duplicate-product',
        }),
        actor: ACTOR,
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('leaves a recovery run when a later step fails, then completes it', async () => {
    let failures = 1;
    const failingSnapshots: SnapshotStore = {
      ...h.snapshots,
      async mergeProduct(options) {
        if (failures > 0) {
          failures -= 1;
          throw new Error('simulated snapshot migration failure');
        }
        return h.snapshots.mergeProduct(options);
      },
    };

    const merge = createMergeService({
      catalogue: h.catalogue,
      snapshots: failingSnapshots,
      rollups: h.rollups,
      adminStore: h.adminStore,
      now: () => NOW,
    });

    await expect(merge.merge({ ...mergeBody(), actor: ACTOR })).rejects.toMatchObject({
      statusCode: 500,
    });

    const open = await h.adminStore.listOpenMergeRuns(10);
    expect(open).toHaveLength(1);
    expect(open[0]?.status).toBe('failed');

    const repaired = await merge.repairPendingMerges({ actor: ACTOR });
    expect(repaired.repaired).toBe(1);
    expect(repaired.failed).toBe(0);
    expect(repaired.remaining).toBe(0);

    expect(await h.snapshots.countForProduct('duplicate-product')).toBe(0);
    expect(await h.catalogue.findListing('listing-of-duplicate')).toMatchObject({
      canonicalProductId: 'surviving-product',
    });
  });
});
