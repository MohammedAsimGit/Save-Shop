import { ComparisonCacheModel } from '../../models/comparisonCache.js';
import type { ComparisonCache, ComparisonCacheEntry } from './comparisonCache.js';

/**
 * MongoDB-backed comparison cache.
 *
 * Chosen over Redis because the API already depends on MongoDB: one store, one
 * connection, no new operational secret. The unique index on `key` makes
 * `set` a single upsert, and the `expiresAt` TTL index keeps the collection from
 * growing, but **expiry is enforced on read** - the TTL monitor runs roughly once
 * a minute and is treated as housekeeping, never as correctness.
 */
export function createMongoComparisonCache(): ComparisonCache {
  return {
    kind: 'mongodb',

    async get(key: string): Promise<ComparisonCacheEntry | null> {
      const document = await ComparisonCacheModel.findOne({ key }).lean();
      if (!document) return null;

      const expiresAt = new Date(document.expiresAt);
      if (expiresAt.getTime() <= Date.now()) {
        // Best effort: an entry past its expiry must not be served even if the
        // TTL monitor has not reached it yet.
        await ComparisonCacheModel.deleteOne({ key });
        return null;
      }

      return {
        key: document.key,
        payload: document.payload,
        createdAt: new Date(document.createdAt),
        expiresAt,
      };
    },

    async set(entry: ComparisonCacheEntry): Promise<void> {
      await ComparisonCacheModel.updateOne(
        { key: entry.key },
        {
          $set: {
            payload: entry.payload,
            createdAt: entry.createdAt,
            expiresAt: entry.expiresAt,
          },
          $setOnInsert: { key: entry.key },
        },
        { upsert: true },
      );
    },

    async delete(key: string): Promise<void> {
      await ComparisonCacheModel.deleteOne({ key });
    },

    async clear(): Promise<number> {
      const result = await ComparisonCacheModel.deleteMany({});
      return result.deletedCount ?? 0;
    },
  };
}
