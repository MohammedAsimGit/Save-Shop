import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { OfferSnapshot } from '@smart-shopping/shared';

import { PriceDailyRollupModel } from '../src/models/priceDailyRollup.js';
import { PriceSnapshotModel } from '../src/models/priceSnapshot.js';
import { RetentionRunModel } from '../src/models/retentionRun.js';
import { runRetentionJob } from '../src/services/retention/retentionJob.js';
import { createMongoRollupStore } from '../src/services/rollups/mongoRollupStore.js';
import { createRollupService } from '../src/services/rollups/rollupService.js';
import type { RollupRecord, RollupStore } from '../src/services/rollups/rollupStore.js';
import { createMongoSnapshotStore } from '../src/services/snapshots/mongoSnapshotStore.js';
import { createMemorySnapshotStore } from '../src/services/snapshots/memorySnapshotStore.js';
import {
  DISABLED_SOURCE,
  SAMPLE_SOURCE,
  VERIFIED_SOURCE,
  makeSnapshot,
} from './helpers/snapshots.js';

/**
 * MongoDB-backed rollups and compaction.
 *
 * These run against a real `mongod` (in-memory binary) because the guarantees the
 * sprint depends on - the unique insert-only key, the compound history indexes,
 * `$setOnInsert` upserts and batched deletes - only exist in the database.
 */

let server: MongoMemoryServer;

const SOURCES = [VERIFIED_SOURCE, SAMPLE_SOURCE, DISABLED_SOURCE];
const NOW = new Date('2026-12-01T12:00:00.000Z');
const snapshots = createMongoSnapshotStore();
const rollups = createMongoRollupStore();

beforeAll(async () => {
  server = await MongoMemoryServer.create();
  await mongoose.connect(server.getUri(), { dbName: 'saveshop-rollups-test' });
}, 180_000);

afterAll(async () => {
  await mongoose.disconnect();
  await server.stop();
}, 60_000);

beforeEach(async () => {
  await Promise.all([
    PriceSnapshotModel.deleteMany({}),
    PriceDailyRollupModel.deleteMany({}),
    RetentionRunModel.deleteMany({}),
  ]);
});

async function seed(store: ReturnType<typeof createMemorySnapshotStore>, rows: OfferSnapshot[]) {
  const result = await store.saveMany(rows, {
    sources: SOURCES,
    now: NOW,
    includeSampleSources: true,
  });
  if (result.rejected > 0) throw new Error('fixture rejected');
}

function makeRollup(overrides: Partial<RollupRecord> = {}): RollupRecord {
  const dateKey = overrides.dateKey ?? '2026-09-01';
  const date = new Date(`${dateKey}T00:00:00.000Z`);

  return {
    rollupKey: `key-${dateKey}-${overrides.marketplaceId ?? 'amazon'}-${overrides.sourceId ?? VERIFIED_SOURCE.id}`,
    productId: 'sony-wh1000xm5',
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
    observationCount: 3,
    availabilityCounts: { inStock: 2, outOfStock: 1, preorder: 0, unknown: 0 },
    sourceVerification: 'verified',
    isSample: false,
    generatedAt: NOW,
    ...overrides,
  };
}

describe('PriceDailyRollup model', () => {
  it('creates a unique idempotency key and the history/pruning indexes', async () => {
    await PriceDailyRollupModel.createIndexes();
    const indexes = await PriceDailyRollupModel.collection.indexes();
    const byName = new Map(indexes.map((index) => [index.name, index]));

    expect(byName.get('rollupKey_1')?.unique).toBe(true);
    expect(byName.has('productId_1_dateKey_1')).toBe(true);
    expect(byName.has('productId_1_sourceId_1_dateKey_1')).toBe(true);
    expect(byName.has('productId_1_marketplaceId_1_dateKey_1')).toBe(true);
    expect(byName.has('dateKey_1')).toBe(true);
  });

  it('refuses a duplicate rollup key at the database level', async () => {
    await PriceDailyRollupModel.createIndexes();
    const rollup = makeRollup();

    await PriceDailyRollupModel.create(rollup);
    await expect(PriceDailyRollupModel.create(rollup)).rejects.toThrow();

    expect(await PriceDailyRollupModel.countDocuments({})).toBe(1);
  });
});

describe('createMongoRollupStore', () => {
  it('inserts once and treats a rerun as existing', async () => {
    const rows = [makeRollup(), makeRollup({ marketplaceId: 'flipkart' })];

    const first = await rollups.insertMany(rows);
    const second = await rollups.insertMany(rows);

    expect(first).toEqual({ inserted: 2, existing: 0 });
    expect(second).toEqual({ inserted: 0, existing: 2 });
    expect(await PriceDailyRollupModel.countDocuments({})).toBe(2);
  });

  it('round-trips money, availability and provenance', async () => {
    await rollups.insertMany([
      makeRollup({ sourceId: SAMPLE_SOURCE.id, sourceVerification: 'sample', isSample: true }),
    ]);

    const stored = await rollups.listForDay('2026-09-01');
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      productId: 'sony-wh1000xm5',
      sourceId: SAMPLE_SOURCE.id,
      marketplaceId: 'amazon',
      currency: 'INR',
      dateKey: '2026-09-01',
      observationCount: 3,
      sourceVerification: 'sample',
      isSample: true,
    });
    expect(stored[0]?.minPrice.amountMinor).toBe(2_500_000);
    expect(stored[0]?.availabilityCounts.outOfStock).toBe(1);
    expect(stored[0]?.windowStart.toISOString()).toBe('2026-09-01T00:00:00.000Z');
  });

  it('lists by product, day range, source and marketplace', async () => {
    await rollups.insertMany([
      makeRollup({ dateKey: '2026-08-01', rollupKey: 'aug' }),
      makeRollup({ dateKey: '2026-09-01', rollupKey: 'sep' }),
      makeRollup({ dateKey: '2026-09-02', rollupKey: 'sep-flipkart', marketplaceId: 'flipkart' }),
      makeRollup({
        dateKey: '2026-09-02',
        rollupKey: 'sep-sample',
        sourceId: SAMPLE_SOURCE.id,
        sourceVerification: 'sample',
        isSample: true,
      }),
      makeRollup({ productId: 'boAt-airdopes-141', rollupKey: 'other-product' }),
    ]);

    const window = await rollups.list({
      productId: 'sony-wh1000xm5',
      fromDate: '2026-09-01',
      toDate: '2026-09-30',
      limit: 100,
    });
    // Deterministic order: day, then marketplace, then source.
    expect(window.map((rollup) => rollup.rollupKey)).toEqual(['sep', 'sep-sample', 'sep-flipkart']);

    const flipkart = await rollups.list({
      productId: 'sony-wh1000xm5',
      fromDate: '2026-09-01',
      toDate: '2026-09-30',
      marketplaceId: 'flipkart',
      limit: 100,
    });
    expect(flipkart).toHaveLength(1);

    const sample = await rollups.list({
      productId: 'sony-wh1000xm5',
      fromDate: '2026-09-01',
      toDate: '2026-09-30',
      sourceId: SAMPLE_SOURCE.id,
      limit: 100,
    });
    expect(sample).toHaveLength(1);
    expect(sample[0]?.isSample).toBe(true);
  });

  it('replaces a day only on explicit recompute', async () => {
    await rollups.insertMany([makeRollup()]);

    const result = await rollups.replaceDay('2026-09-01', [
      makeRollup({ observationCount: 5, rollupKey: 'recomputed' }),
    ]);

    expect(result.deleted).toBe(1);
    expect(result.inserted).toBe(1);
    const stored = await rollups.listForDay('2026-09-01');
    expect(stored).toHaveLength(1);
    expect(stored[0]?.observationCount).toBe(5);
  });

  it('prunes old days in bounded batches', async () => {
    await rollups.insertMany([
      makeRollup({ dateKey: '2026-06-01', rollupKey: 'june' }),
      makeRollup({ dateKey: '2026-07-01', rollupKey: 'july' }),
      makeRollup({ dateKey: '2026-09-01', rollupKey: 'september' }),
    ]);

    expect(await rollups.countOlderThan('2026-08-01')).toBe(2);
    expect(await rollups.deleteOlderThan('2026-08-01', 1)).toBe(1);
    expect(await rollups.countOlderThan('2026-08-01')).toBe(1);
    expect(await rollups.deleteOlderThan('2026-08-01', 10)).toBe(1);
    expect(await rollups.countOlderThan('2026-08-01')).toBe(0);
    expect(await rollups.listForDay('2026-09-01')).toHaveLength(1);
  });
});

describe('rollup generation against MongoDB', () => {
  it('pages a day without double counting and generates an idempotent rollup', async () => {
    const memory = createMemorySnapshotStore();
    await seed(memory, [
      makeSnapshot({
        capturedAt: '2026-09-01T01:00:00.000Z',
        price: { amountMinor: 3_000_000, currency: 'INR' },
      }),
      makeSnapshot({
        capturedAt: '2026-09-01T02:00:00.000Z',
        price: { amountMinor: 2_800_000, currency: 'INR' },
      }),
      makeSnapshot({
        capturedAt: '2026-09-01T03:00:00.000Z',
        price: { amountMinor: 3_100_000, currency: 'INR' },
      }),
      makeSnapshot({
        capturedAt: '2026-09-01T04:00:00.000Z',
        price: { amountMinor: 2_900_000, currency: 'INR' },
      }),
      makeSnapshot({
        capturedAt: '2026-09-01T05:00:00.000Z',
        price: { amountMinor: 2_950_000, currency: 'INR' },
      }),
    ]);
    const rows = await memory.listRange({
      from: new Date('2026-09-01T00:00:00.000Z'),
      to: new Date('2026-09-02T00:00:00.000Z'),
      limit: 100,
    });
    await snapshots.saveMany(
      rows.map((row) => row.snapshot),
      { sources: SOURCES, now: NOW, includeSampleSources: true },
    );

    const service = createRollupService({
      snapshotStore: snapshots,
      rollupStore: rollups,
      now: () => NOW,
      batchSize: 2,
    });

    const first = await service.rollupDay('2026-09-01');
    const second = await service.rollupDay('2026-09-01');

    expect(first.observationsScanned).toBe(5);
    expect(first.groups).toBe(1);
    expect(first.inserted).toBe(1);
    expect(second.inserted).toBe(0);
    expect(second.existing).toBe(1);

    const stored = await rollups.listForDay('2026-09-01');
    expect(stored[0]?.observationCount).toBe(5);
    expect(stored[0]?.minPrice.amountMinor).toBe(2_800_000);
    expect(stored[0]?.maxPrice.amountMinor).toBe(3_100_000);
    expect(stored[0]?.firstPrice.amountMinor).toBe(3_000_000);
    expect(stored[0]?.lastPrice.amountMinor).toBe(2_950_000);
  });
});

describe('retention job against MongoDB', () => {
  const CONFIG = {
    rawRetentionDays: 30,
    rollupRetentionDays: 120,
    batchSize: 2,
    dryRun: false,
  } as const;

  async function seedRawDay(): Promise<void> {
    const memory = createMemorySnapshotStore();
    await seed(memory, [
      makeSnapshot({
        capturedAt: '2026-09-01T01:00:00.000Z',
        price: { amountMinor: 3_000_000, currency: 'INR' },
      }),
      makeSnapshot({
        capturedAt: '2026-09-01T02:00:00.000Z',
        price: { amountMinor: 2_800_000, currency: 'INR' },
      }),
      makeSnapshot({
        capturedAt: '2026-09-01T03:00:00.000Z',
        price: { amountMinor: 3_100_000, currency: 'INR' },
      }),
      makeSnapshot({
        capturedAt: '2026-11-25T02:00:00.000Z',
        price: { amountMinor: 2_700_000, currency: 'INR' },
      }),
    ]);
    const rows = await memory.listRange({
      from: new Date('2026-08-01T00:00:00.000Z'),
      to: new Date('2026-12-01T00:00:00.000Z'),
      limit: 100,
    });
    await snapshots.saveMany(
      rows.map((row) => row.snapshot),
      { sources: SOURCES, now: NOW, includeSampleSources: true },
    );
  }

  it('deletes only rollup-verified days and records the run', async () => {
    await seedRawDay();

    const service = createRollupService({
      snapshotStore: snapshots,
      rollupStore: rollups,
      now: () => NOW,
    });

    const recorded: string[] = [];
    const report = await runRetentionJob({
      snapshotStore: snapshots,
      rollupStore: rollups,
      rollupService: service,
      config: CONFIG,
      now: () => NOW,
      recordRun: async (result) => {
        recorded.push(result.status);
        await RetentionRunModel.create({
          startedAt: new Date(result.startedAt),
          finishedAt: new Date(result.finishedAt),
          dryRun: result.dryRun,
          status: result.status,
          rawRetentionDays: result.rawRetentionDays,
          rollupRetentionDays: result.rollupRetentionDays,
          batchSize: result.batchSize,
          rawCutoff: new Date(result.rawCutoff),
          rollupCutoff: new Date(result.rollupCutoff),
          dateRange: result.dateRange,
          stats: result,
          failedDays: [...result.failedDays],
        });
      },
    });

    expect(report.status).toBe('completed');
    expect(report.observationsDeleted).toBe(3);
    expect(recorded).toEqual(['completed']);

    expect(
      await PriceSnapshotModel.countDocuments({
        capturedAt: { $lt: new Date('2026-11-01T00:00:00.000Z') },
      }),
    ).toBe(0);
    expect(await PriceSnapshotModel.countDocuments({})).toBe(1);

    const stored = await rollups.listForDay('2026-09-01');
    expect(stored).toHaveLength(1);
    expect(stored[0]?.observationCount).toBe(3);

    const runs = await RetentionRunModel.find({}).lean();
    expect(runs).toHaveLength(1);
    expect(runs[0]?.stats).toMatchObject({ observationsDeleted: 3 });
  });

  it('is idempotent and leaves a workable history after compaction', async () => {
    await seedRawDay();
    const service = createRollupService({
      snapshotStore: snapshots,
      rollupStore: rollups,
      now: () => NOW,
    });

    const options = {
      snapshotStore: snapshots,
      rollupStore: rollups,
      rollupService: service,
      config: CONFIG,
      now: () => NOW,
    };

    await runRetentionJob(options);
    const second = await runRetentionJob(options);

    expect(second.observationsScanned).toBe(0);
    expect(second.observationsDeleted).toBe(0);
    expect(await rollups.listForDay('2026-09-01')).toHaveLength(1);
    expect((await service.verifyDay('2026-09-01')).ok).toBe(true);
  });

  it('does not delete a day whose rollup write failed', async () => {
    await seedRawDay();

    const failing: RollupStore = {
      ...rollups,
      async insertMany() {
        throw new Error('write concern failed');
      },
    };

    const report = await runRetentionJob({
      snapshotStore: snapshots,
      rollupStore: failing,
      rollupService: createRollupService({
        snapshotStore: snapshots,
        rollupStore: failing,
        now: () => NOW,
      }),
      config: CONFIG,
      now: () => NOW,
    });

    expect(report.observationsDeleted).toBe(0);
    expect(report.failedDays[0]?.reason).toBe('error');
    expect(
      await PriceSnapshotModel.countDocuments({
        capturedAt: { $lt: new Date('2026-11-01T00:00:00.000Z') },
      }),
    ).toBe(3);
  });
});
