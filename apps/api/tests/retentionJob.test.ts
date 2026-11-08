import { describe, expect, it } from 'vitest';

import type { OfferSnapshot } from '@smart-shopping/shared';

import {
  RetentionJobBusyError,
  isRetentionRunActive,
  runRetentionJob,
  type RetentionConfig,
  type RetentionReport,
} from '../src/services/retention/retentionJob.js';
import { createMemoryRollupStore } from '../src/services/rollups/memoryRollupStore.js';
import { createRollupService } from '../src/services/rollups/rollupService.js';
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
 * Retention job tests.
 *
 * The job deletes data, so every test asks the same question in a different way:
 * *did anything disappear that should not have?* Deletion is only allowed after a
 * rollup is persisted **and** verified against the remaining rows.
 */

const SOURCES = [VERIFIED_SOURCE, SAMPLE_SOURCE, DISABLED_SOURCE];
const NOW = new Date('2026-12-01T12:00:00.000Z');

const CONFIG: RetentionConfig = {
  rawRetentionDays: 30,
  rollupRetentionDays: 120,
  batchSize: 2,
  dryRun: false,
};

interface Harness {
  readonly snapshots: SnapshotStore;
  readonly rollups: RollupStore;
  readonly run: (
    overrides?: Partial<RetentionConfig>,
    options?: RunOptions,
  ) => Promise<RetentionReport>;
}

interface RunOptions {
  readonly signal?: AbortSignal;
  readonly recordRun?: (report: RetentionReport) => Promise<void>;
  readonly snapshotStore?: SnapshotStore;
  readonly rollupStore?: RollupStore;
}

function harness(): Harness {
  const snapshots = createMemorySnapshotStore();
  const rollups = createMemoryRollupStore();

  return {
    snapshots,
    rollups,
    run: (overrides = {}, options = {}) => {
      const snapshotStore = options.snapshotStore ?? snapshots;
      const rollupStore = options.rollupStore ?? rollups;
      return runRetentionJob({
        snapshotStore,
        rollupStore,
        rollupService: createRollupService({
          snapshotStore,
          rollupStore,
          now: () => NOW,
        }),
        config: { ...CONFIG, ...overrides },
        now: () => NOW,
        ...(options.signal ? { signal: options.signal } : {}),
        ...(options.recordRun ? { recordRun: options.recordRun } : {}),
      });
    },
  };
}

async function seed(store: SnapshotStore, snapshots: readonly OfferSnapshot[]): Promise<void> {
  const result = await store.saveMany(snapshots, {
    sources: SOURCES,
    now: NOW,
    includeSampleSources: true,
  });
  if (result.rejected > 0) throw new Error('fixture rejected by the snapshot store');
}

/** A day far outside the raw window, and a day comfortably inside it. */
const OLD_DAY = '2026-09-01';
const RECENT_DAY = '2026-11-25';

async function seedOldAndRecent(store: SnapshotStore): Promise<void> {
  await seed(store, [
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
}

function dayCount(store: SnapshotStore, dateKey: string): Promise<number> {
  const from = new Date(`${dateKey}T00:00:00.000Z`);
  const to = new Date(from.getTime() + 86_400_000);
  return store.countRange({ from, to });
}

describe('runRetentionJob', () => {
  it('defaults to reporting only when dry-run is requested', async () => {
    const h = harness();
    await seedOldAndRecent(h.snapshots);

    const report = await h.run({ dryRun: true });

    expect(report.status).toBe('completed');
    expect(report.dryRun).toBe(true);
    expect(report.observationsEligibleForDeletion).toBe(3);
    expect(report.observationsDeleted).toBe(0);
    expect(report.daysCompacted).toBe(0);
    // Rollups are still generated and verified: that is not destructive.
    expect(report.rollupsInserted).toBe(1);
    expect(await dayCount(h.snapshots, OLD_DAY)).toBe(3);
    expect(await h.rollups.listForDay(OLD_DAY)).toHaveLength(1);
  });

  it('compacts an old day only, leaving recent observations at full resolution', async () => {
    const h = harness();
    await seedOldAndRecent(h.snapshots);

    const report = await h.run();

    expect(report.observationsScanned).toBe(3);
    expect(report.observationsEligibleForDeletion).toBe(3);
    expect(report.observationsDeleted).toBe(3);
    expect(report.daysCompacted).toBe(1);
    expect(report.dateRange).toEqual({ from: OLD_DAY, to: OLD_DAY });
    expect(await dayCount(h.snapshots, OLD_DAY)).toBe(0);
    expect(await dayCount(h.snapshots, RECENT_DAY)).toBe(1);

    const rollups = await h.rollups.listForDay(OLD_DAY);
    expect(rollups).toHaveLength(1);
    expect(rollups[0]?.observationCount).toBe(3);
    expect(rollups[0]?.minPrice.amountMinor).toBe(2_800_000);
    expect(rollups[0]?.maxPrice.amountMinor).toBe(3_100_000);
    expect(rollups[0]?.firstPrice.amountMinor).toBe(3_000_000);
    expect(rollups[0]?.lastPrice.amountMinor).toBe(3_100_000);
  });

  it('deletes nothing when the rollup cannot be verified', async () => {
    const h = harness();
    await seedOldAndRecent(h.snapshots);

    // A store that claims success but persists nothing: verification must catch it.
    const lyingStore: RollupStore = {
      ...createMemoryRollupStore(),
      async insertMany() {
        return { inserted: 1, existing: 0 };
      },
    };

    const report = await h.run({}, { rollupStore: lyingStore });

    expect(report.daysCompacted).toBe(0);
    expect(report.observationsDeleted).toBe(0);
    expect(report.failedDays[0]?.reason).toBe('verification_failed');
    expect(report.failedDays[0]?.dateKey).toBe(OLD_DAY);
    expect(await dayCount(h.snapshots, OLD_DAY)).toBe(3);
  });

  it('is idempotent: a second run finds nothing left to compact', async () => {
    const h = harness();
    await seedOldAndRecent(h.snapshots);

    const first = await h.run();
    const second = await h.run();

    expect(first.observationsDeleted).toBe(3);
    expect(second.observationsScanned).toBe(0);
    expect(second.observationsDeleted).toBe(0);
    expect(second.rollupsInserted).toBe(0);
    expect(await h.rollups.listForDay(OLD_DAY)).toHaveLength(1);
  });

  it('deletes in bounded batches and still removes the whole day', async () => {
    const h = harness();
    await seedOldAndRecent(h.snapshots);

    let deleteCalls = 0;
    const counting: SnapshotStore = {
      ...h.snapshots,
      async deleteRange(query) {
        deleteCalls += 1;
        return h.snapshots.deleteRange(query);
      },
    };

    const report = await h.run({ batchSize: 2 }, { snapshotStore: counting });

    expect(report.observationsDeleted).toBe(3);
    // 3 rows in batches of 2: two deletes, never one unbounded deleteMany.
    expect(deleteCalls).toBe(2);
    expect(await dayCount(h.snapshots, OLD_DAY)).toBe(0);
  });

  it('refuses to start a second run while one is active', async () => {
    const h = harness();
    await seedOldAndRecent(h.snapshots);

    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const blocked: SnapshotStore = {
      ...h.snapshots,
      async listDaysBefore(query) {
        await gate;
        return h.snapshots.listDaysBefore(query);
      },
    };

    const running = h.run({ dryRun: true }, { snapshotStore: blocked });
    await Promise.resolve();
    expect(isRetentionRunActive()).toBe(true);

    await expect(h.run({ dryRun: true })).rejects.toBeInstanceOf(RetentionJobBusyError);

    release();
    await running;
    expect(isRetentionRunActive()).toBe(false);
  });

  it('stops without deleting when the run is aborted', async () => {
    const h = harness();
    await seedOldAndRecent(h.snapshots);

    const controller = new AbortController();
    controller.abort();

    const report = await h.run({}, { signal: controller.signal });

    expect(report.status).toBe('aborted');
    expect(report.aborted).toBe(true);
    expect(report.observationsDeleted).toBe(0);
    expect(await dayCount(h.snapshots, OLD_DAY)).toBe(3);
  });

  it('prunes rollups older than the rollup retention window', async () => {
    const h = harness();
    await seedOldAndRecent(h.snapshots);

    // 120 days before 2026-12-01 is 2026-08-03; seed an aggregate from July.
    await h.rollups.insertMany([
      {
        rollupKey: 'seeded-old-rollup',
        productId: 'sony-wh1000xm5',
        sourceId: VERIFIED_SOURCE.id,
        marketplaceId: 'amazon',
        currency: 'INR',
        dateKey: '2026-07-01',
        date: new Date('2026-07-01T00:00:00.000Z'),
        windowStart: new Date('2026-07-01T00:00:00.000Z'),
        windowEnd: new Date('2026-07-02T00:00:00.000Z'),
        minPrice: { amountMinor: 1_000, currency: 'INR' },
        maxPrice: { amountMinor: 1_000, currency: 'INR' },
        firstPrice: { amountMinor: 1_000, currency: 'INR' },
        lastPrice: { amountMinor: 1_000, currency: 'INR' },
        observationCount: 1,
        availabilityCounts: { inStock: 1, outOfStock: 0, preorder: 0, unknown: 0 },
        sourceVerification: 'verified',
        isSample: false,
        generatedAt: NOW,
      },
    ]);

    const dry = await h.run({ dryRun: true });
    expect(dry.rollupsEligibleForDeletion).toBe(1);
    expect(dry.rollupsDeleted).toBe(0);

    const report = await h.run();
    expect(report.rollupsDeleted).toBe(1);
    expect(await h.rollups.countOlderThan('2026-08-03')).toBe(0);
  });

  it('records the run and does not fail when recording breaks', async () => {
    const h = harness();
    await seedOldAndRecent(h.snapshots);

    const recorded: RetentionReport[] = [];
    await h.run({ dryRun: true }, { recordRun: async (report) => void recorded.push(report) });
    expect(recorded).toHaveLength(1);
    expect(recorded[0]?.observationsEligibleForDeletion).toBe(3);

    const report = await h.run(
      { dryRun: true },
      {
        recordRun: async () => {
          throw new Error('audit collection is down');
        },
      },
    );
    expect(report.status).toBe('completed');
  });

  it('handles an empty database without inventing work', async () => {
    const h = harness();

    const report = await h.run();

    expect(report.status).toBe('completed');
    expect(report.dateRange).toBeNull();
    expect(report.daysProcessed).toBe(0);
    expect(report.observationsScanned).toBe(0);
    expect(report.rollupsPlanned).toBe(0);
    expect(report.observationsDeleted).toBe(0);
  });
});
