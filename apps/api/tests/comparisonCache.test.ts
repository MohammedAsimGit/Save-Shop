import { describe, expect, it } from 'vitest';

import type { ProductComparisonResponse } from '@smart-shopping/shared';

import { createComparisonService } from '../src/services/comparison.service.js';
import { comparisonCacheKey } from '../src/services/cache/comparisonCache.js';
import { createMemoryComparisonCache } from '../src/services/cache/memoryComparisonCache.js';
import { createMemorySnapshotStore } from '../src/services/snapshots/memorySnapshotStore.js';
import type { SnapshotStore } from '../src/services/snapshots/snapshotStore.js';
import {
  DISABLED_SOURCE,
  SAMPLE_SOURCE,
  VERIFIED_SOURCE,
  makeAdapter,
  makeSnapshot,
} from './helpers/snapshots.js';

const PRODUCT_ID = 'sony-wh1000xm5';
const T0 = new Date('2026-11-07T06:00:00.000Z');

function harness(options: {
  readonly ttlSeconds?: number;
  readonly price?: number;
  readonly cacheTtlSeconds?: number;
  readonly persistDemoSnapshots?: boolean;
  readonly source?: typeof VERIFIED_SOURCE;
  readonly store?: SnapshotStore;
}) {
  const clock = { current: T0 };
  const now = () => clock.current;
  const cache = createMemoryComparisonCache(now);
  const store = options.store ?? createMemorySnapshotStore();
  const source = options.source ?? VERIFIED_SOURCE;

  const adapter = makeAdapter(source, async () => ({
    snapshots: [
      makeSnapshot({
        sourceId: source.id,
        capturedAt: clock.current.toISOString(),
        ttlSeconds: options.ttlSeconds ?? 3600,
        price: { amountMinor: options.price ?? 2_699_000, currency: 'INR' },
      }),
    ],
    warnings: [],
  }));

  const disabled = makeAdapter(DISABLED_SOURCE, async () => {
    throw new Error('a disabled adapter must never be queried');
  });

  const service = createComparisonService({
    adapters: [adapter.adapter, disabled.adapter],
    cache,
    snapshotStore: store,
    now,
    cacheTtlSeconds: options.cacheTtlSeconds ?? 300,
    ...(options.persistDemoSnapshots === undefined
      ? {}
      : { persistDemoSnapshots: options.persistDemoSnapshots }),
  });

  return { service, cache, store, clock, calls: adapter.calls, disabledCalls: disabled.calls };
}

describe('comparison cache', () => {
  it('serves a repeated comparison from cache without querying the adapter again', async () => {
    const { service, calls } = harness({});

    const first = await service.getComparison(PRODUCT_ID);
    const second = await service.getComparison(PRODUCT_ID);

    expect(calls()).toBe(1);
    expect(second.lowest?.price.amountMinor).toBe(first.lowest?.price.amountMinor);
  });

  it('recomputes once the cache entry has expired', async () => {
    const { service, calls, clock } = harness({ cacheTtlSeconds: 300 });

    await service.getComparison(PRODUCT_ID);
    clock.current = new Date(T0.getTime() + 301_000);
    await service.getComparison(PRODUCT_ID);

    expect(calls()).toBe(2);
  });

  it('never marks a stale offer as fresh, even inside a still-valid cache entry', async () => {
    const { service, cache, calls, clock } = harness({ ttlSeconds: 60, cacheTtlSeconds: 3600 });

    const first = await service.getComparison(PRODUCT_ID);
    expect(first.lowest?.freshness).toBe('fresh');

    // Simulate an entry written with a longer life than the observation it holds.
    await cache.set({
      key: comparisonCacheKey({
        productId: PRODUCT_ID,
        currency: 'INR',
        enabledSourceIds: [VERIFIED_SOURCE.id],
      }),
      payload: first,
      createdAt: T0,
      expiresAt: new Date(T0.getTime() + 3_600_000),
    });

    clock.current = new Date(T0.getTime() + 120_000);
    const second = await service.getComparison(PRODUCT_ID);

    expect(calls()).toBe(2);
    expect(second.lowest?.freshness).toBe('fresh');
    expect(second.lowest?.capturedAt).toBe(clock.current.toISOString());
  });

  it('drops a cached payload that no longer matches the response contract', async () => {
    const { service, cache, calls } = harness({});

    await cache.set({
      key: comparisonCacheKey({
        productId: PRODUCT_ID,
        currency: 'INR',
        enabledSourceIds: [VERIFIED_SOURCE.id],
      }),
      payload: { productId: PRODUCT_ID, offers: 'not-an-array' },
      createdAt: T0,
      expiresAt: new Date(T0.getTime() + 300_000),
    });

    const response = await service.getComparison(PRODUCT_ID);

    expect(calls()).toBe(1);
    expect(response.offers.length).toBeGreaterThan(0);
  });

  it('invalidate(productId) forces the next read to hit the source again', async () => {
    const { service, calls } = harness({});

    await service.getComparison(PRODUCT_ID);
    await service.invalidate(PRODUCT_ID);
    await service.getComparison(PRODUCT_ID);

    expect(calls()).toBe(2);
  });

  it('invalidate() clears every cached comparison', async () => {
    const { service, calls } = harness({});

    await service.getComparison(PRODUCT_ID);
    await service.invalidate();
    await service.getComparison(PRODUCT_ID);

    expect(calls()).toBe(2);
  });

  it('does not cache a run where an adapter failed', async () => {
    const clock = { current: T0 };
    const now = () => clock.current;
    const cache = createMemoryComparisonCache(now);
    const healthy = makeAdapter(VERIFIED_SOURCE, async () => ({
      snapshots: [makeSnapshot({ capturedAt: clock.current.toISOString() })],
      warnings: [],
    }));
    let failing = true;
    let failingCalls = 0;
    const flaky = makeAdapter(SAMPLE_SOURCE, async () => {
      failingCalls += 1;
      if (failing) throw new Error('provider unavailable');
      return { snapshots: [], warnings: [] };
    });

    const service = createComparisonService({
      adapters: [healthy.adapter, flaky.adapter],
      cache,
      snapshotStore: createMemorySnapshotStore(),
      now,
      cacheTtlSeconds: 300,
    });

    const degraded = await service.getComparison(PRODUCT_ID);
    expect(degraded.notices.join(' ')).toMatch(/could not be read/i);

    failing = false;
    const recovered = await service.getComparison(PRODUCT_ID);

    expect(failingCalls).toBe(2);
    expect(recovered.notices.join(' ')).not.toMatch(/could not be read/i);
  });

  it('never queries a disabled adapter', async () => {
    const { service, disabledCalls } = harness({});

    await service.getComparison(PRODUCT_ID);

    expect(disabledCalls()).toBe(0);
  });

  it('keeps attribution and source verification on a cached response', async () => {
    const { service } = harness({});

    const first = await service.getComparison(PRODUCT_ID);
    const second: ProductComparisonResponse = await service.getComparison(PRODUCT_ID);

    expect(second.lowest?.source.id).toBe(VERIFIED_SOURCE.id);
    expect(second.lowest?.isVerified).toBe(true);
    expect(second.status).toBe('verified');
    expect(second.notices).toEqual(first.notices);
  });
});

describe('snapshot ingestion from the comparison service', () => {
  it('persists what the adapters reported on a cache miss only', async () => {
    const inner = createMemorySnapshotStore();
    let saves = 0;
    const countingStore: SnapshotStore = {
      kind: 'memory',
      async saveMany(snapshots, context) {
        saves += 1;
        return inner.saveMany(snapshots, context);
      },
      listHistory: (query) => inner.listHistory(query),
    };

    const { service } = harness({ store: countingStore });

    await service.getComparison(PRODUCT_ID);
    await service.getComparison(PRODUCT_ID);

    expect(saves).toBe(1);
    const history = await inner.listHistory({
      productId: PRODUCT_ID,
      from: new Date(T0.getTime() - 86_400_000),
      to: new Date(T0.getTime() + 86_400_000),
      limit: 10,
    });
    expect(history).toHaveLength(1);
  });

  it('stores no sample observations when demo persistence is disabled', async () => {
    const inner = createMemorySnapshotStore();
    const { service } = harness({
      store: inner,
      source: SAMPLE_SOURCE,
      persistDemoSnapshots: false,
    });

    const response = await service.getComparison(PRODUCT_ID);

    expect(response.status).toBe('sample_only');
    const history = await inner.listHistory({
      productId: PRODUCT_ID,
      from: new Date(T0.getTime() - 86_400_000),
      to: new Date(T0.getTime() + 86_400_000),
      limit: 10,
    });
    expect(history).toEqual([]);
  });

  it('keeps serving the comparison when persistence fails', async () => {
    const brokenStore: SnapshotStore = {
      kind: 'mongodb',
      async saveMany() {
        throw new Error('mongodb is down');
      },
      async listHistory() {
        return [];
      },
    };

    const { service } = harness({ store: brokenStore });
    const response = await service.getComparison(PRODUCT_ID);

    expect(response.lowest).not.toBeNull();
    expect(response.offers.length).toBeGreaterThan(0);
  });
});
