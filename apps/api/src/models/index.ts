import { ComparisonCacheModel } from './comparisonCache.js';
import { PriceSnapshotModel } from './priceSnapshot.js';

/**
 * Creates the indexes the persistence layer depends on.
 *
 * Mongoose's `autoIndex` does this lazily on first use, but the unique
 * `observationKey` index is what makes ingestion idempotent, and the history
 * queries are useless without their compound indexes. Doing it explicitly at boot
 * means the guarantees exist before the first request, not after the first write.
 *
 * Safe to re-run: MongoDB treats an identical index definition as a no-op.
 */
export async function ensureModelIndexes(): Promise<void> {
  await Promise.all([PriceSnapshotModel.createIndexes(), ComparisonCacheModel.createIndexes()]);
}
