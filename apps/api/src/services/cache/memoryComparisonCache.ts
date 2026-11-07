import type { ComparisonCache, ComparisonCacheEntry } from './comparisonCache.js';

/**
 * In-memory comparison cache.
 *
 * Default when no database is configured and the implementation used by tests.
 * Expired entries are still returned; the comparison service decides freshness so
 * both backends behave identically (Mongo's TTL monitor is asynchronous, so
 * relying on it for correctness would make behaviour depend on the backend).
 */
export function createMemoryComparisonCache(now: () => Date = () => new Date()): ComparisonCache {
  const entries = new Map<string, ComparisonCacheEntry>();

  return {
    kind: 'memory',

    async get(key: string): Promise<ComparisonCacheEntry | null> {
      const entry = entries.get(key);
      if (!entry) return null;
      if (entry.expiresAt.getTime() <= now().getTime()) {
        entries.delete(key);
        return null;
      }
      return entry;
    },

    async set(entry: ComparisonCacheEntry): Promise<void> {
      entries.set(entry.key, entry);
    },

    async delete(key: string): Promise<void> {
      entries.delete(key);
    },

    async clear(): Promise<number> {
      const size = entries.size;
      entries.clear();
      return size;
    },
  };
}
