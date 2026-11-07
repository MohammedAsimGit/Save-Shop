import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { createMemorySnapshotStore } from './memorySnapshotStore.js';
import { createMongoSnapshotStore } from './mongoSnapshotStore.js';
import type { SnapshotStore } from './snapshotStore.js';

export type { SnapshotStore, SnapshotWriteResult, StoredSnapshot } from './snapshotStore.js';

/**
 * Chooses the snapshot store once per process.
 *
 * A configured MongoDB gets the durable store; an empty `MONGODB_URI` (the
 * documented development mode) gets the in-memory store so history still works
 * within one process. The choice is logged rather than left to guesswork, because
 * "history disappears on restart" must never be a surprise.
 */
export function createSnapshotStore(): SnapshotStore {
  if (!env.isDatabaseConfigured) {
    logger.info('MONGODB_URI is not set - price history is kept in memory for this process only.');
    return createMemorySnapshotStore();
  }

  logger.info('Price history store: MongoDB collection "price_snapshots"');
  return createMongoSnapshotStore();
}

/** True when demo observations may be persisted (never in production by default). */
export const persistDemoSnapshots = env.persistDemoSnapshots;

/**
 * Process-wide store. Comparison ingestion and the history endpoint must share
 * one instance, otherwise the in-memory fallback would write and read different
 * maps and history would always look empty.
 */
export const snapshotStore: SnapshotStore = createSnapshotStore();
