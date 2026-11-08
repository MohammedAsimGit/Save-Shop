import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { snapshotStore } from '../snapshots/index.js';
import { createMemoryRollupStore } from './memoryRollupStore.js';
import { createMongoRollupStore } from './mongoRollupStore.js';
import { createRollupService, type RollupService } from './rollupService.js';
import type { RollupStore } from './rollupStore.js';

export type { RollupRecord, RollupStore } from './rollupStore.js';
export { rollupKey } from './rollupStore.js';
export type { DayVerification, RollupDayResult } from './rollupService.js';
export { aggregateDay, dateKeyOf, isDateKey, utcDayBounds } from './rollupService.js';
export { createMemoryRollupStore } from './memoryRollupStore.js';
export { createRollupService } from './rollupService.js';

/**
 * Chooses the rollup store once per process, exactly like the snapshot and cache
 * stores: MongoDB when configured, memory otherwise so the history endpoint is
 * still exercisable without infrastructure.
 *
 * The in-memory store cannot back the retention job (`npm run retention` requires
 * MongoDB), because compacting a process-local map would only fake durability.
 */
export function createRollupStore(): RollupStore {
  if (!env.isDatabaseConfigured) {
    logger.info('MONGODB_URI is not set - daily rollups are kept in memory for this process only.');
    return createMemoryRollupStore();
  }

  logger.info('Daily rollups: MongoDB collection "price_daily_rollups"');
  return createMongoRollupStore();
}

/** Process-wide store, shared by the history endpoint and the retention job. */
export const rollupStore: RollupStore = createRollupStore();

/** Process-wide rollup service (aggregation only; no HTTP and no Mongoose models). */
export const rollupService: RollupService = createRollupService({
  snapshotStore,
  rollupStore,
  batchSize: env.retention.batchSize,
});
