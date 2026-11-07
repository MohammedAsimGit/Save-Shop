import {
  prepareSnapshotRecords,
  selectHistoryRecords,
  toStoredSnapshot,
  type SnapshotHistoryQuery,
  type SnapshotRecord,
  type SnapshotStore,
  type SnapshotWriteContext,
  type SnapshotWriteResult,
  type StoredSnapshot,
} from './snapshotStore.js';

/**
 * In-memory snapshot store.
 *
 * Used by tests and by development when `MONGODB_URI` is empty, so the history
 * endpoint is exercisable without infrastructure. It keeps exactly the same
 * validation and ordering rules as the MongoDB store; only the storage medium
 * differs. Data lives as long as the process, which is stated in the docs rather
 * than implied.
 */
export function createMemorySnapshotStore(seed: readonly SnapshotRecord[] = []): SnapshotStore {
  const records = new Map<string, SnapshotRecord>();
  for (const record of seed) records.set(record.observationKey, record);

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
  };
}
