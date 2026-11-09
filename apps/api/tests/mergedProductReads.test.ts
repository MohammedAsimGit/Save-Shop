import { describe, expect, it } from 'vitest';

import { createMemoryAdminStore } from '../src/services/admin/adminStore.js';
import type { AdminActor } from '../src/services/admin/auth.service.js';
import { createMergeService } from '../src/services/admin/merge.service.js';
import { catalogueStore } from '../src/services/catalogue/index.js';
import { createHistoryService } from '../src/services/history.service.js';
import { createMemoryRollupStore } from '../src/services/rollups/memoryRollupStore.js';
import { createMemorySnapshotStore } from '../src/services/snapshots/memorySnapshotStore.js';
import { makeProduct } from './helpers/catalogue.js';
import { SAMPLE_SOURCE, VERIFIED_SOURCE, makeSnapshot } from './helpers/snapshots.js';

/**
 * Reads after a canonical merge.
 *
 * The source product is archived with `mergedInto`, so a request for its old id must
 * still resolve. This test exercises the real singleton catalogue + the real merge
 * service + the history service: observations move to the surviving product, and a
 * history request for the archived id must find them through the redirect rather
 * than returning an empty window.
 */

const NOW = new Date('2026-11-09T12:00:00.000Z');

const ACTOR: AdminActor = {
  id: 'admin-1',
  email: 'ops@example.com',
  displayName: 'Operations',
  role: 'catalogue_admin',
};

describe('history after a canonical merge', () => {
  it('resolves the archived product id to the surviving product', async () => {
    await catalogueStore.upsertProducts([
      makeProduct({
        id: 'merge-source',
        name: 'WH-1000XM5 Wireless Headphones',
        brand: 'Sony',
        model: 'WH-1000XM5',
        category: 'audio',
      }),
      makeProduct({
        id: 'merge-target',
        name: 'WH-1000XM5 Wireless Headphones',
        brand: 'Sony',
        model: 'WH-1000XM5',
        category: 'audio',
      }),
    ]);

    const snapshots = createMemorySnapshotStore();
    await snapshots.saveMany(
      [makeSnapshot({ productId: 'merge-target', capturedAt: '2026-11-05T05:00:00.000Z' })],
      { sources: [VERIFIED_SOURCE], now: NOW, includeSampleSources: true },
    );

    const rollups = createMemoryRollupStore();
    const merge = createMergeService({
      catalogue: catalogueStore,
      snapshots,
      rollups,
      adminStore: createMemoryAdminStore(),
      now: () => NOW,
    });

    const result = await merge.merge({
      sourceProductId: 'merge-source',
      targetProductId: 'merge-target',
      reason: 'two records for the same headphones',
      confirmConflicts: false,
      actor: ACTOR,
    });

    expect(result.status).toBe('completed');
    expect(await catalogueStore.findProduct('merge-source')).toMatchObject({
      mergedInto: 'merge-target',
    });

    const history = createHistoryService({
      store: snapshots,
      rollupStore: rollups,
      sources: [VERIFIED_SOURCE, SAMPLE_SOURCE],
      now: () => NOW,
    });

    const response = await history.getHistory('merge-source', { period: '30d', limit: 200 });

    expect(response.observations).toHaveLength(1);
    expect(response.observations[0]?.productId).toBe('merge-target');
  });
});
