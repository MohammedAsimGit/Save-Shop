import { describe, expect, it } from 'vitest';

import { createMemorySnapshotStore } from '../src/services/snapshots/memorySnapshotStore.js';
import { observationKey, prepareSnapshotRecords } from '../src/services/snapshots/snapshotStore.js';
import {
  DISABLED_SOURCE,
  SAMPLE_SOURCE,
  VERIFIED_SOURCE,
  makeSnapshot,
} from './helpers/snapshots.js';

const NOW = new Date('2026-11-07T06:00:00.000Z');
const SOURCES = [VERIFIED_SOURCE, SAMPLE_SOURCE, DISABLED_SOURCE];

function context(includeSampleSources = true) {
  return { sources: SOURCES, now: NOW, includeSampleSources };
}

describe('prepareSnapshotRecords', () => {
  it('derives provenance from the registered source, not from the observation', () => {
    const prepared = prepareSnapshotRecords([makeSnapshot()], context());

    expect(prepared.rejected).toBe(0);
    expect(prepared.records).toHaveLength(1);
    expect(prepared.records[0]?.sourceVerification).toBe('verified');
    expect(prepared.records[0]?.isSample).toBe(false);
    expect(prepared.records[0]?.expiresAt.toISOString()).toBe('2026-11-07T06:00:00.000Z');
  });

  it('marks sample observations as sample', () => {
    const prepared = prepareSnapshotRecords(
      [makeSnapshot({ sourceId: SAMPLE_SOURCE.id })],
      context(),
    );

    expect(prepared.records[0]?.isSample).toBe(true);
    expect(prepared.records[0]?.sourceVerification).toBe('sample');
  });

  it('rejects observations that do not satisfy the snapshot contract', () => {
    const prepared = prepareSnapshotRecords(
      [{ ...makeSnapshot(), price: { amountMinor: 12.5, currency: 'INR' } }, { nope: true }, null],
      context(),
    );

    expect(prepared.records).toHaveLength(0);
    expect(prepared.rejected).toBe(3);
  });

  it('rejects observations from an unregistered source', () => {
    const prepared = prepareSnapshotRecords(
      [makeSnapshot({ sourceId: 'never-registered' })],
      context(),
    );

    expect(prepared.records).toHaveLength(0);
    expect(prepared.rejected).toBe(1);
  });

  it('rejects observations from a disabled source instead of storing them', () => {
    const prepared = prepareSnapshotRecords(
      [makeSnapshot({ sourceId: DISABLED_SOURCE.id })],
      context(),
    );

    expect(prepared.records).toHaveLength(0);
    expect(prepared.rejected).toBe(1);
  });

  it('skips sample observations when policy forbids persisting them', () => {
    const prepared = prepareSnapshotRecords(
      [makeSnapshot({ sourceId: SAMPLE_SOURCE.id }), makeSnapshot()],
      context(false),
    );

    expect(prepared.records).toHaveLength(1);
    expect(prepared.skippedSample).toBe(1);
    expect(prepared.rejected).toBe(0);
  });

  it('produces a stable observation key that ignores ingestion time', () => {
    const snapshot = makeSnapshot();
    const key = observationKey(snapshot);

    expect(key).toHaveLength(64);
    expect(observationKey({ ...snapshot })).toBe(key);
    expect(
      observationKey({ ...snapshot, price: { amountMinor: 2_699_001, currency: 'INR' } }),
    ).not.toBe(key);
    expect(observationKey({ ...snapshot, capturedAt: '2026-11-07T05:00:01.000Z' })).not.toBe(key);
  });
});

describe('createMemorySnapshotStore', () => {
  it('stores observations and reads them back through the transport contract', async () => {
    const store = createMemorySnapshotStore();
    const result = await store.saveMany([makeSnapshot()], context());

    expect(result).toEqual({ stored: 1, duplicates: 0, rejected: 0, skippedSample: 0 });

    const history = await store.listHistory({
      productId: 'sony-wh1000xm5',
      from: new Date('2026-11-01T00:00:00.000Z'),
      to: NOW,
      limit: 50,
    });

    expect(history).toHaveLength(1);
    expect(history[0]?.snapshot.price.amountMinor).toBe(2_699_000);
    expect(history[0]?.snapshot.capturedAt).toBe('2026-11-07T05:00:00.000Z');
    expect(history[0]?.sourceVerification).toBe('verified');
  });

  it('is idempotent: replaying the same observation stores it once', async () => {
    const store = createMemorySnapshotStore();
    const snapshot = makeSnapshot();

    const first = await store.saveMany([snapshot], context());
    const second = await store.saveMany([snapshot], context());

    expect(first.stored).toBe(1);
    expect(second).toEqual({ stored: 0, duplicates: 1, rejected: 0, skippedSample: 0 });

    const history = await store.listHistory({
      productId: 'sony-wh1000xm5',
      from: new Date('2026-11-01T00:00:00.000Z'),
      to: NOW,
      limit: 50,
    });
    expect(history).toHaveLength(1);
  });

  it('returns observations oldest first and honours the limit with the newest points', async () => {
    const store = createMemorySnapshotStore();
    await store.saveMany(
      [
        makeSnapshot({
          capturedAt: '2026-11-04T05:00:00.000Z',
          price: { amountMinor: 3_000_000, currency: 'INR' },
        }),
        makeSnapshot({
          capturedAt: '2026-11-06T05:00:00.000Z',
          price: { amountMinor: 2_800_000, currency: 'INR' },
        }),
        makeSnapshot({
          capturedAt: '2026-11-05T05:00:00.000Z',
          price: { amountMinor: 2_900_000, currency: 'INR' },
        }),
      ],
      context(),
    );

    const all = await store.listHistory({
      productId: 'sony-wh1000xm5',
      from: new Date('2026-11-01T00:00:00.000Z'),
      to: NOW,
      limit: 50,
    });
    expect(all.map((entry) => entry.snapshot.price.amountMinor)).toEqual([
      3_000_000, 2_900_000, 2_800_000,
    ]);

    const limited = await store.listHistory({
      productId: 'sony-wh1000xm5',
      from: new Date('2026-11-01T00:00:00.000Z'),
      to: NOW,
      limit: 2,
    });
    expect(limited.map((entry) => entry.snapshot.price.amountMinor)).toEqual([
      2_900_000, 2_800_000,
    ]);
  });

  it('filters by product, window, source and marketplace', async () => {
    const store = createMemorySnapshotStore();
    await store.saveMany(
      [
        makeSnapshot({ capturedAt: '2026-11-01T05:00:00.000Z' }),
        makeSnapshot({ capturedAt: '2026-11-06T05:00:00.000Z' }),
        makeSnapshot({
          capturedAt: '2026-11-06T06:00:00.000Z',
          sourceId: SAMPLE_SOURCE.id,
        }),
        makeSnapshot({
          capturedAt: '2026-11-06T07:00:00.000Z',
          marketplaceId: 'flipkart',
          price: { amountMinor: 2_500_000, currency: 'INR' },
        }),
        makeSnapshot({ productId: 'boAt-airdopes-141', capturedAt: '2026-11-06T08:00:00.000Z' }),
      ],
      context(),
    );

    const recent = await store.listHistory({
      productId: 'sony-wh1000xm5',
      from: new Date('2026-11-05T00:00:00.000Z'),
      to: NOW,
      limit: 50,
    });
    expect(recent).toHaveLength(3);

    const verifiedOnly = await store.listHistory({
      productId: 'sony-wh1000xm5',
      from: new Date('2026-11-05T00:00:00.000Z'),
      to: NOW,
      sourceId: VERIFIED_SOURCE.id,
      limit: 50,
    });
    expect(verifiedOnly).toHaveLength(2);
    expect(verifiedOnly.every((entry) => !entry.isSample)).toBe(true);

    const flipkartOnly = await store.listHistory({
      productId: 'sony-wh1000xm5',
      from: new Date('2026-11-05T00:00:00.000Z'),
      to: NOW,
      marketplaceId: 'flipkart',
      limit: 50,
    });
    expect(flipkartOnly).toHaveLength(1);
    expect(flipkartOnly[0]?.snapshot.marketplaceId).toBe('flipkart');
  });

  it('returns nothing for a product with no stored observations', async () => {
    const store = createMemorySnapshotStore();

    const history = await store.listHistory({
      productId: 'sony-wh1000xm5',
      from: new Date('2026-11-01T00:00:00.000Z'),
      to: NOW,
      limit: 50,
    });

    expect(history).toEqual([]);
  });

  it('drops invalid and unauthorised observations without failing the batch', async () => {
    const store = createMemorySnapshotStore();

    const result = await store.saveMany(
      [
        makeSnapshot({ capturedAt: '2026-11-06T05:00:00.000Z' }),
        { productId: 'sony-wh1000xm5' },
        makeSnapshot({ sourceId: 'ghost-source' }),
      ],
      context(),
    );

    expect(result).toEqual({ stored: 1, duplicates: 0, rejected: 2, skippedSample: 0 });
  });
});
