import {
  observationKey,
  prepareSnapshotRecords,
  selectHistoryRecords,
  toStoredSnapshot,
  type SnapshotDayCount,
  type SnapshotHistoryQuery,
  type SnapshotRangeQuery,
  type SnapshotRecord,
  type SnapshotStore,
  type SnapshotWriteContext,
  type SnapshotWriteResult,
  type StoredSnapshot,
} from './snapshotStore.js';

/** `YYYY-MM-DD` in UTC; the calendar day a `capturedAt` belongs to. */
export function utcDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * In-memory snapshot store.
 *
 * Used by tests and by development when `MONGODB_URI` is empty, so the history
 * endpoint is exercisable without infrastructure. It keeps exactly the same
 * validation, ordering and paging rules as the MongoDB store; only the storage
 * medium differs. Data lives as long as the process, which is stated in the docs
 * rather than implied.
 */
export function createMemorySnapshotStore(seed: readonly SnapshotRecord[] = []): SnapshotStore {
  const records = new Map<string, SnapshotRecord>();
  for (const record of seed) records.set(record.observationKey, record);

  const ordered = (): SnapshotRecord[] =>
    [...records.values()].sort((a, b) => {
      const diff = a.capturedAt.getTime() - b.capturedAt.getTime();
      if (diff !== 0) return diff;
      return a.observationKey.localeCompare(b.observationKey);
    });

  return {
    kind: 'memory',

    async saveMany(
      rawSnapshots: readonly unknown[],
      context: SnapshotWriteContext,
    ): Promise<SnapshotWriteResult> {
      const prepared = prepareSnapshotRecords(rawSnapshots, context);
      let stored = 0;
      let duplicates = 0;

      for (const record of prepared.records) {
        if (records.has(record.observationKey)) {
          duplicates += 1;
          continue;
        }
        records.set(record.observationKey, record);
        stored += 1;
      }

      return {
        stored,
        duplicates,
        rejected: prepared.rejected,
        skippedSample: prepared.skippedSample,
      };
    },

    async listHistory(query: SnapshotHistoryQuery): Promise<StoredSnapshot[]> {
      return selectHistoryRecords([...records.values()], query).map(toStoredSnapshot);
    },

    async listRange(query: SnapshotRangeQuery): Promise<StoredSnapshot[]> {
      const fromMs = query.from.getTime();
      const toMs = query.to.getTime();
      const after = query.after;

      const page = ordered().filter((record) => {
        const capturedMs = record.capturedAt.getTime();
        if (capturedMs < fromMs || capturedMs >= toMs) return false;
        if (after) {
          const afterMs = after.capturedAt.getTime();
          if (capturedMs < afterMs) return false;
          if (capturedMs === afterMs && record.observationKey <= after.observationKey) {
            return false;
          }
        }
        return true;
      });

      return page.slice(0, query.limit).map(toStoredSnapshot);
    },

    async listDaysBefore(query: {
      readonly cutoff: Date;
      readonly limit: number;
    }): Promise<SnapshotDayCount[]> {
      const cutoffMs = query.cutoff.getTime();
      const counts = new Map<string, number>();

      for (const record of records.values()) {
        if (record.capturedAt.getTime() >= cutoffMs) continue;
        const key = utcDayKey(record.capturedAt);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }

      return [...counts.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(0, query.limit)
        .map(([date, count]) => ({ date, count }));
    },

    async countRange(query: { readonly from: Date; readonly to: Date }): Promise<number> {
      const fromMs = query.from.getTime();
      const toMs = query.to.getTime();
      let count = 0;
      for (const record of records.values()) {
        const capturedMs = record.capturedAt.getTime();
        if (capturedMs >= fromMs && capturedMs < toMs) count += 1;
      }
      return count;
    },

    async mergeProduct(options: {
      readonly sourceProductId: string;
      readonly targetProductId: string;
    }): Promise<{ moved: number; deduped: number }> {
      let moved = 0;
      let deduped = 0;

      for (const [key, record] of [...records.entries()]) {
        if (record.productId !== options.sourceProductId) continue;

        const reassigned: SnapshotRecord = {
          ...record,
          productId: options.targetProductId,
          observationKey: observationKey({
            ...toStoredSnapshot(record).snapshot,
            productId: options.targetProductId,
          }),
        };

        if (records.has(reassigned.observationKey)) {
          records.delete(key);
          deduped += 1;
          continue;
        }

        records.delete(key);
        records.set(reassigned.observationKey, reassigned);
        moved += 1;
      }

      return { moved, deduped };
    },

    async countForProduct(productId: string): Promise<number> {
      return [...records.values()].filter((record) => record.productId === productId).length;
    },

    async deleteRange(query: {
      readonly from: Date;
      readonly to: Date;
      readonly limit: number;
    }): Promise<number> {
      const fromMs = query.from.getTime();
      const toMs = query.to.getTime();

      const candidates = ordered()
        .filter((record) => {
          const capturedMs = record.capturedAt.getTime();
          return capturedMs >= fromMs && capturedMs < toMs;
        })
        .slice(0, query.limit);

      for (const record of candidates) records.delete(record.observationKey);
      return candidates.length;
    },
  };
}
