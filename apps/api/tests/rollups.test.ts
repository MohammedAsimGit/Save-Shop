import { describe, expect, it } from 'vitest';

import type { OfferSnapshot } from '@smart-shopping/shared';

import {
  aggregateDay,
  createRollupService,
  dateKeyOf,
  utcDayBounds,
} from '../src/services/rollups/index.js';
import { createMemoryRollupStore } from '../src/services/rollups/memoryRollupStore.js';
import type { RollupStore } from '../src/services/rollups/rollupStore.js';
import { createMemorySnapshotStore } from '../src/services/snapshots/memorySnapshotStore.js';
import type { SnapshotStore } from '../src/services/snapshots/snapshotStore.js';
import {
  DISABLED_SOURCE,
  SAMPLE_SOURCE,
  VERIFIED_SOURCE,
  makeSnapshot,
} from './helpers/snapshots.js';

/**
 * Daily rollup tests.
 *
 * Everything here runs against the in-memory stores, which implement the same
 * insert-only semantics as MongoDB, so a passing test cannot depend on behaviour
 * production does not have. MongoDB-specific guarantees (indexes, upserts,
 * aggregation paging) live in `mongoRollups.test.ts`.
 */

const NOW = new Date('2026-11-10T12:00:00.000Z');
const SOURCES = [VERIFIED_SOURCE, SAMPLE_SOURCE, DISABLED_SOURCE];

function harness(): {
  readonly snapshots: SnapshotStore;
  readonly rollups: RollupStore;
  readonly service: ReturnType<typeof createRollupService>;
} {
  const snapshots = createMemorySnapshotStore();
  const rollups = createMemoryRollupStore();
  const service = createRollupService({
    snapshotStore: snapshots,
    rollupStore: rollups,
    now: () => NOW,
    batchSize: 2,
  });

  return { snapshots, rollups, service };
}

async function seed(store: SnapshotStore, snapshots: readonly OfferSnapshot[]): Promise<void> {
  const result = await store.saveMany(snapshots, {
    sources: SOURCES,
    now: NOW,
    includeSampleSources: true,
  });
  if (result.rejected > 0) throw new Error('fixture rejected by the snapshot store');
}

describe('aggregateDay', () => {
  it('computes min, max, first, last and count from stored observations', async () => {
    const snapshots = createMemorySnapshotStore();
    await seed(snapshots, [
      makeSnapshot({
        capturedAt: '2026-11-01T01:00:00.000Z',
        price: { amountMinor: 3_000_000, currency: 'INR' },
      }),
      makeSnapshot({
        capturedAt: '2026-11-01T02:00:00.000Z',
        price: { amountMinor: 2_800_000, currency: 'INR' },
      }),
      makeSnapshot({
        capturedAt: '2026-11-01T03:00:00.000Z',
        price: { amountMinor: 3_100_000, currency: 'INR' },
      }),
    ]);

    const rows = await snapshots.listRange({
      from: new Date('2026-11-01T00:00:00.000Z'),
      to: new Date('2026-11-02T00:00:00.000Z'),
      limit: 100,
    });

    const { rollups } = aggregateDay(rows, { dateKey: '2026-11-01', generatedAt: NOW });

    expect(rollups).toHaveLength(1);
    const rollup = rollups[0]!;
    expect(rollup.minPrice.amountMinor).toBe(2_800_000);
    expect(rollup.maxPrice.amountMinor).toBe(3_100_000);
    expect(rollup.firstPrice.amountMinor).toBe(3_000_000);
    expect(rollup.lastPrice.amountMinor).toBe(3_100_000);
    expect(rollup.observationCount).toBe(3);
    expect(rollup.dateKey).toBe('2026-11-01');
    expect(rollup.windowStart.toISOString()).toBe('2026-11-01T00:00:00.000Z');
    expect(rollup.windowEnd.toISOString()).toBe('2026-11-02T00:00:00.000Z');
    expect(rollup.generatedAt).toEqual(NOW);
  });

  it('never mixes currencies into one aggregate', async () => {
    const snapshots = createMemorySnapshotStore();
    await seed(snapshots, [
      makeSnapshot({
        capturedAt: '2026-11-01T01:00:00.000Z',
        price: { amountMinor: 2_699_000, currency: 'INR' },
      }),
      makeSnapshot({
        capturedAt: '2026-11-01T02:00:00.000Z',
        price: { amountMinor: 32_000, currency: 'USD' },
      }),
    ]);

    const rows = await snapshots.listRange({
      from: new Date('2026-11-01T00:00:00.000Z'),
      to: new Date('2026-11-02T00:00:00.000Z'),
      limit: 100,
    });
    const { rollups } = aggregateDay(rows, { dateKey: '2026-11-01', generatedAt: NOW });

    expect(rollups).toHaveLength(2);
    const byCurrency = new Map(rollups.map((rollup) => [rollup.currency, rollup]));
    expect(byCurrency.get('INR')?.minPrice.amountMinor).toBe(2_699_000);
    expect(byCurrency.get('USD')?.minPrice.amountMinor).toBe(32_000);
    expect(rollups.every((rollup) => rollup.observationCount === 1)).toBe(true);
  });

  it('keeps verified and sample observations in separate aggregates', async () => {
    const snapshots = createMemorySnapshotStore();
    await seed(snapshots, [
      makeSnapshot({
        capturedAt: '2026-11-01T01:00:00.000Z',
        price: { amountMinor: 2_699_000, currency: 'INR' },
      }),
      makeSnapshot({
        capturedAt: '2026-11-01T02:00:00.000Z',
        sourceId: SAMPLE_SOURCE.id,
        price: { amountMinor: 1_000, currency: 'INR' },
      }),
    ]);

    const rows = await snapshots.listRange({
      from: new Date('2026-11-01T00:00:00.000Z'),
      to: new Date('2026-11-02T00:00:00.000Z'),
      limit: 100,
    });
    const { rollups } = aggregateDay(rows, { dateKey: '2026-11-01', generatedAt: NOW });

    expect(rollups).toHaveLength(2);
    const verified = rollups.find((rollup) => rollup.sourceVerification === 'verified');
    const sample = rollups.find((rollup) => rollup.sourceVerification === 'sample');

    expect(verified?.isSample).toBe(false);
    expect(verified?.minPrice.amountMinor).toBe(2_699_000);
    expect(sample?.isSample).toBe(true);
    // A sample price never lowers a verified aggregate, even when it is cheaper.
    expect(sample?.minPrice.amountMinor).toBe(1_000);
  });

  it('splits marketplaces, because a day is per marketplace', async () => {
    const snapshots = createMemorySnapshotStore();
    await seed(snapshots, [
      makeSnapshot({ capturedAt: '2026-11-01T01:00:00.000Z', marketplaceId: 'amazon' }),
      makeSnapshot({ capturedAt: '2026-11-01T02:00:00.000Z', marketplaceId: 'flipkart' }),
    ]);

    const rows = await snapshots.listRange({
      from: new Date('2026-11-01T00:00:00.000Z'),
      to: new Date('2026-11-02T00:00:00.000Z'),
      limit: 100,
    });
    const { rollups } = aggregateDay(rows, { dateKey: '2026-11-01', generatedAt: NOW });

    expect(rollups.map((rollup) => rollup.marketplaceId).sort()).toEqual(['amazon', 'flipkart']);
  });

  it('counts availability per observation', async () => {
    const snapshots = createMemorySnapshotStore();
    await seed(snapshots, [
      makeSnapshot({ capturedAt: '2026-11-01T01:00:00.000Z', availability: 'in_stock' }),
      makeSnapshot({ capturedAt: '2026-11-01T02:00:00.000Z', availability: 'out_of_stock' }),
      makeSnapshot({ capturedAt: '2026-11-01T03:00:00.000Z', availability: 'in_stock' }),
    ]);

    const rows = await snapshots.listRange({
      from: new Date('2026-11-01T00:00:00.000Z'),
      to: new Date('2026-11-02T00:00:00.000Z'),
      limit: 100,
    });
    const { rollups } = aggregateDay(rows, { dateKey: '2026-11-01', generatedAt: NOW });

    expect(rollups[0]?.availabilityCounts).toEqual({
      inStock: 2,
      outOfStock: 1,
      preorder: 0,
      unknown: 0,
    });
  });

  it('produces no aggregate for an empty day instead of an invented zero price', async () => {
    const { rollups } = aggregateDay([], { dateKey: '2026-11-01', generatedAt: NOW });
    expect(rollups).toEqual([]);
  });
});

describe('createRollupService', () => {
  it('persists one rollup per group and reports statistics', async () => {
    const { snapshots, rollups, service } = harness();
    await seed(snapshots, [
      makeSnapshot({ capturedAt: '2026-11-01T01:00:00.000Z' }),
      makeSnapshot({ capturedAt: '2026-11-01T02:00:00.000Z', marketplaceId: 'flipkart' }),
    ]);

    const result = await service.rollupDay('2026-11-01');

    expect(result.groups).toBe(2);
    expect(result.inserted).toBe(2);
    expect(result.existing).toBe(0);
    expect(result.observationsScanned).toBe(2);
    expect(await rollups.listForDay('2026-11-01')).toHaveLength(2);
  });

  it('is idempotent: a second run inserts nothing and keeps the aggregate intact', async () => {
    const { snapshots, rollups, service } = harness();
    await seed(snapshots, [
      makeSnapshot({
        capturedAt: '2026-11-01T01:00:00.000Z',
        price: { amountMinor: 2_699_000, currency: 'INR' },
      }),
      makeSnapshot({
        capturedAt: '2026-11-01T02:00:00.000Z',
        price: { amountMinor: 2_500_000, currency: 'INR' },
      }),
    ]);

    const first = await service.rollupDay('2026-11-01');
    const second = await service.rollupDay('2026-11-01');

    expect(first.inserted).toBe(1);
    expect(second.inserted).toBe(0);
    expect(second.existing).toBe(1);

    const stored = await rollups.listForDay('2026-11-01');
    expect(stored).toHaveLength(1);
    expect(stored[0]?.observationCount).toBe(2);
    expect(stored[0]?.minPrice.amountMinor).toBe(2_500_000);
  });

  it('does not shrink a committed rollup when raw rows were partially deleted', async () => {
    const { snapshots, rollups, service } = harness();
    await seed(snapshots, [
      makeSnapshot({
        capturedAt: '2026-11-01T01:00:00.000Z',
        price: { amountMinor: 2_699_000, currency: 'INR' },
      }),
      makeSnapshot({
        capturedAt: '2026-11-01T02:00:00.000Z',
        price: { amountMinor: 2_500_000, currency: 'INR' },
      }),
      makeSnapshot({
        capturedAt: '2026-11-01T03:00:00.000Z',
        price: { amountMinor: 2_600_000, currency: 'INR' },
      }),
    ]);
    await service.rollupDay('2026-11-01');

    // Simulate a crash halfway through compaction: one row is gone.
    const { start, end } = utcDayBounds('2026-11-01');
    await snapshots.deleteRange({ from: start, to: end, limit: 1 });

    const rerun = await service.rollupDay('2026-11-01');
    expect(rerun.inserted).toBe(0);
    expect(rerun.existing).toBe(1);

    const stored = await rollups.listForDay('2026-11-01');
    expect(stored[0]?.observationCount).toBe(3);
    // Verification still passes: the stored rollup covers at least what remains.
    expect((await service.verifyDay('2026-11-01')).ok).toBe(true);
  });

  it('reprocesses a day only when explicitly asked to refresh', async () => {
    const { snapshots, rollups, service } = harness();
    await seed(snapshots, [
      makeSnapshot({
        capturedAt: '2026-11-01T01:00:00.000Z',
        price: { amountMinor: 2_699_000, currency: 'INR' },
      }),
    ]);
    await service.rollupDay('2026-11-01');

    await seed(snapshots, [
      makeSnapshot({
        capturedAt: '2026-11-01T05:00:00.000Z',
        price: { amountMinor: 2_400_000, currency: 'INR' },
      }),
    ]);

    await service.rollupDay('2026-11-01');
    expect((await rollups.listForDay('2026-11-01'))[0]?.observationCount).toBe(1);

    const refreshed = await service.rollupDay('2026-11-01', { refresh: true });
    expect(refreshed.refreshed).toBe(true);
    expect(refreshed.deletedBeforeRefresh).toBe(1);

    const stored = await rollups.listForDay('2026-11-01');
    expect(stored).toHaveLength(1);
    expect(stored[0]?.observationCount).toBe(2);
    expect(stored[0]?.minPrice.amountMinor).toBe(2_400_000);
  });

  it('reports a missing rollup during verification', async () => {
    const { snapshots, service } = harness();
    await seed(snapshots, [makeSnapshot({ capturedAt: '2026-11-01T01:00:00.000Z' })]);

    const before = await service.verifyDay('2026-11-01');
    expect(before.ok).toBe(false);
    expect(before.missingKeys).toHaveLength(1);

    await service.rollupDay('2026-11-01');
    const after = await service.verifyDay('2026-11-01');
    expect(after.ok).toBe(true);
    expect(after.expectedGroups).toBe(1);
    expect(after.storedGroups).toBe(1);
  });

  it('reports an aggregate that covers fewer observations than the raw day', async () => {
    const { snapshots, rollups, service } = harness();
    await seed(snapshots, [
      makeSnapshot({
        capturedAt: '2026-11-01T01:00:00.000Z',
        price: { amountMinor: 2_699_000, currency: 'INR' },
      }),
      makeSnapshot({
        capturedAt: '2026-11-01T02:00:00.000Z',
        price: { amountMinor: 2_000_000, currency: 'INR' },
      }),
    ]);
    await service.rollupDay('2026-11-01');

    // Replace the day with a deliberately incomplete aggregate.
    const stored = await rollups.listForDay('2026-11-01');
    await rollups.replaceDay('2026-11-01', [
      {
        ...stored[0]!,
        observationCount: 1,
        minPrice: { amountMinor: 2_699_000, currency: 'INR' },
      },
    ]);

    const verification = await service.verifyDay('2026-11-01');
    expect(verification.ok).toBe(false);
    expect(verification.incompleteKeys).toHaveLength(1);
  });

  it('rolls up a range of days inclusive and skips days with no data', async () => {
    const { snapshots, service } = harness();
    await seed(snapshots, [
      makeSnapshot({ capturedAt: '2026-11-01T01:00:00.000Z' }),
      makeSnapshot({ capturedAt: '2026-11-03T01:00:00.000Z' }),
    ]);

    const results = await service.rollupRange({ fromDate: '2026-11-01', toDate: '2026-11-03' });

    expect(results.map((result) => result.dateKey)).toEqual([
      '2026-11-01',
      '2026-11-02',
      '2026-11-03',
    ]);
    expect(results.map((result) => result.groups)).toEqual([1, 0, 1]);
  });

  it('never aggregates neighbouring days into one rollup', async () => {
    const { snapshots, service } = harness();
    await seed(snapshots, [
      makeSnapshot({
        capturedAt: '2026-11-01T23:59:59.000Z',
        price: { amountMinor: 2_699_000, currency: 'INR' },
      }),
      makeSnapshot({
        capturedAt: '2026-11-02T00:00:00.000Z',
        price: { amountMinor: 2_100_000, currency: 'INR' },
      }),
    ]);

    const first = await service.rollupDay('2026-11-01');
    const second = await service.rollupDay('2026-11-02');

    expect(first.observationsScanned).toBe(1);
    expect(second.observationsScanned).toBe(1);
    expect(first.groups).toBe(1);
    expect(second.groups).toBe(1);
  });
});

describe('rollup helpers', () => {
  it('derives a UTC day key and its half-open window', () => {
    expect(dateKeyOf(new Date('2026-11-01T23:59:59.999Z'))).toBe('2026-11-01');
    const { start, end } = utcDayBounds('2026-11-01');
    expect(start.toISOString()).toBe('2026-11-01T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-11-02T00:00:00.000Z');
    expect(() => utcDayBounds('2026-13-01')).toThrow(/Invalid UTC date key/);
  });
});
