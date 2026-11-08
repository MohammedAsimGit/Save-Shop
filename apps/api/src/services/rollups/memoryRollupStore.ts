import {
  compareRollups,
  type RollupInsertResult,
  type RollupListQuery,
  type RollupRecord,
  type RollupStore,
} from './rollupStore.js';

/**
 * In-memory rollup store.
 *
 * Used by tests and by DB-less development, with the same insert-only semantics as
 * MongoDB so a test cannot pass on behaviour production does not have.
 */
export function createMemoryRollupStore(seed: readonly RollupRecord[] = []): RollupStore {
  const records = new Map<string, RollupRecord>();
  for (const record of seed) records.set(record.rollupKey, record);

  return {
    kind: 'memory',

    async insertMany(rollups: readonly RollupRecord[]): Promise<RollupInsertResult> {
      let inserted = 0;
      let existing = 0;

      for (const rollup of rollups) {
        if (records.has(rollup.rollupKey)) {
          existing += 1;
          continue;
        }
        records.set(rollup.rollupKey, rollup);
        inserted += 1;
      }

      return { inserted, existing };
    },

    async replaceDay(
      dateKey: string,
      rollups: readonly RollupRecord[],
    ): Promise<RollupInsertResult & { deleted: number }> {
      let deleted = 0;
      for (const [key, record] of records) {
        if (record.dateKey !== dateKey) continue;
        records.delete(key);
        deleted += 1;
      }

      for (const rollup of rollups) records.set(rollup.rollupKey, rollup);
      return { deleted, inserted: rollups.length, existing: 0 };
    },

    async listForDay(dateKey: string): Promise<RollupRecord[]> {
      return [...records.values()]
        .filter((record) => record.dateKey === dateKey)
        .sort(compareRollups);
    },

    async list(query: RollupListQuery): Promise<RollupRecord[]> {
      return [...records.values()]
        .filter((record) => {
          if (record.productId !== query.productId) return false;
          if (record.dateKey < query.fromDate || record.dateKey > query.toDate) return false;
          if (query.sourceId && record.sourceId !== query.sourceId) return false;
          if (query.marketplaceId && record.marketplaceId !== query.marketplaceId) return false;
          return true;
        })
        .sort(compareRollups)
        .slice(0, query.limit);
    },

    async countOlderThan(dateKey: string): Promise<number> {
      let count = 0;
      for (const record of records.values()) {
        if (record.dateKey < dateKey) count += 1;
      }
      return count;
    },

    async deleteOlderThan(dateKey: string, limit: number): Promise<number> {
      const candidates = [...records.values()]
        .filter((record) => record.dateKey < dateKey)
        .sort(compareRollups)
        .slice(0, limit);

      for (const record of candidates) records.delete(record.rollupKey);
      return candidates.length;
    },
  };
}
