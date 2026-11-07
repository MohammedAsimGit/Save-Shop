import { PriceSnapshotModel, type PriceSnapshotFields } from '../../models/priceSnapshot.js';
import {
  prepareSnapshotRecords,
  toStoredSnapshot,
  type SnapshotHistoryQuery,
  type SnapshotRecord,
  type SnapshotStore,
  type SnapshotWriteContext,
  type SnapshotWriteResult,
  type StoredSnapshot,
} from './snapshotStore.js';

/**
 * MongoDB snapshot store.
 *
 * Writes are `bulkWrite` upserts keyed on `observationKey`, so re-delivering the
 * same provider response costs one round trip and zero new documents. Writes are
 * unordered: one rejected document must not abort the rest of the batch.
 *
 * Database failures are thrown, not swallowed here - the caller (comparison
 * service) logs them and keeps serving the comparison, because a broken history
 * table must not take down the price a shopper is looking at.
 */
export function createMongoSnapshotStore(): SnapshotStore {
  return {
    kind: 'mongodb',

    async saveMany(
      rawSnapshots: readonly unknown[],
      context: SnapshotWriteContext,
    ): Promise<SnapshotWriteResult> {
      const prepared = prepareSnapshotRecords(rawSnapshots, context);

      if (prepared.records.length === 0) {
        return {
          stored: 0,
          duplicates: 0,
          rejected: prepared.rejected,
          skippedSample: prepared.skippedSample,
        };
      }

      try {
        const result = await PriceSnapshotModel.bulkWrite(
          prepared.records.map((record) => ({
            updateOne: {
              filter: { observationKey: record.observationKey },
              // setOnInsert only: an existing observation is never rewritten.
              update: { $setOnInsert: record },
              upsert: true,
            },
          })),
          { ordered: false },
        );

        const stored = result.upsertedCount ?? 0;
        return {
          stored,
          duplicates: prepared.records.length - stored,
          rejected: prepared.rejected,
          skippedSample: prepared.skippedSample,
        };
      } catch (error) {
        // A concurrent writer can win the unique index race; that is still a
        // duplicate, not a failure worth propagating.
        if (isDuplicateKeyError(error)) {
          return {
            stored: 0,
            duplicates: prepared.records.length,
            rejected: prepared.rejected,
            skippedSample: prepared.skippedSample,
          };
        }
        throw error;
      }
    },

    async listHistory(query: SnapshotHistoryQuery): Promise<StoredSnapshot[]> {
      const filter: Record<string, unknown> = {
        productId: query.productId,
        capturedAt: { $gte: query.from, $lte: query.to },
      };
      if (query.sourceId) filter.sourceId = query.sourceId;
      if (query.marketplaceId) filter.marketplaceId = query.marketplaceId;

      // Fetch the newest N, then reverse: the response contract is oldest-first.
      const documents = await PriceSnapshotModel.find(filter)
        .sort({ capturedAt: -1, _id: -1 })
        .limit(query.limit)
        .lean<PriceSnapshotFields[]>();

      return documents.reverse().map((document) => toStoredSnapshot(toRecord(document)));
    },
  };
}

function toRecord(document: PriceSnapshotFields): SnapshotRecord {
  return {
    observationKey: document.observationKey,
    productId: document.productId,
    marketplaceId: document.marketplaceId,
    sourceId: document.sourceId,
    productUrl: document.productUrl,
    price: {
      amountMinor: document.price.amountMinor,
      currency: document.price.currency,
    },
    availability: document.availability,
    capturedAt: new Date(document.capturedAt),
    ttlSeconds: document.ttlSeconds,
    expiresAt: new Date(document.expiresAt),
    attribution: {
      label: document.attribution.label,
      ...(document.attribution.url ? { url: document.attribution.url } : {}),
    },
    sourceVerification: document.sourceVerification,
    isSample: document.isSample,
    ingestedAt: new Date(document.ingestedAt),
  };
}

function isDuplicateKeyError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as { code?: unknown; writeErrors?: { code?: unknown }[] };
  if (candidate.code === 11000) return true;
  return Array.isArray(candidate.writeErrors)
    ? candidate.writeErrors.some((entry) => entry.code === 11000)
    : false;
}
