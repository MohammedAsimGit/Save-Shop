import type { ClientSession } from 'mongoose';

import { PriceSnapshotModel, type PriceSnapshotFields } from '../../models/priceSnapshot.js';
import type { StoreSession } from '../storeSession.js';
import {
  observationKey,
  prepareSnapshotRecords,
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

    async listRange(query: SnapshotRangeQuery): Promise<StoredSnapshot[]> {
      const conditions: Record<string, unknown>[] = [
        { capturedAt: { $gte: query.from, $lt: query.to } },
      ];
      if (query.after) {
        conditions.push({
          $or: [
            { capturedAt: { $gt: query.after.capturedAt } },
            {
              capturedAt: query.after.capturedAt,
              observationKey: { $gt: query.after.observationKey },
            },
          ],
        });
      }

      const documents = await PriceSnapshotModel.find({ $and: conditions })
        .sort({ capturedAt: 1, observationKey: 1 })
        .limit(query.limit)
        .lean<PriceSnapshotFields[]>();

      return documents.map((document) => toStoredSnapshot(toRecord(document)));
    },

    async listDaysBefore(query: {
      readonly cutoff: Date;
      readonly limit: number;
    }): Promise<SnapshotDayCount[]> {
      const rows = await PriceSnapshotModel.aggregate<{ _id: string; count: number }>([
        { $match: { capturedAt: { $lt: query.cutoff } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$capturedAt', timezone: 'UTC' } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
        { $limit: query.limit },
      ]);

      return rows.map((row) => ({ date: row._id, count: row.count }));
    },

    async countRange(query: { readonly from: Date; readonly to: Date }): Promise<number> {
      return PriceSnapshotModel.countDocuments({
        capturedAt: { $gte: query.from, $lt: query.to },
      });
    },

    async mergeProduct(options: {
      readonly sourceProductId: string;
      readonly targetProductId: string;
      readonly tx?: StoreSession;
    }): Promise<{ moved: number; deduped: number }> {
      const session = options.tx as ClientSession | undefined;
      const documents = await PriceSnapshotModel.find({ productId: options.sourceProductId })
        .sort({ capturedAt: 1, observationKey: 1 })
        .lean<PriceSnapshotFields[]>();

      let moved = 0;
      let deduped = 0;

      for (const document of documents) {
        const nextKey = observationKey({
          productId: options.targetProductId,
          marketplaceId: document.marketplaceId,
          sourceId: document.sourceId,
          productUrl: document.productUrl,
          price: {
            amountMinor: document.price.amountMinor,
            currency: document.price.currency,
          },
          availability: document.availability,
          capturedAt: new Date(document.capturedAt).toISOString(),
          ttlSeconds: document.ttlSeconds,
          attribution: {
            label: document.attribution.label,
            ...(document.attribution.url ? { url: document.attribution.url } : {}),
          },
        });

        const exists = await PriceSnapshotModel.findOne({ observationKey: nextKey })
          .select({ _id: 1 })
          .session(session ?? null)
          .lean<{ _id: unknown }>();

        // `_id` is not part of the inferred lean type but every stored observation has
        // one; the migration targets that exact document.
        const documentId = (document as unknown as { _id: unknown })._id;

        if (exists) {
          // The same observation already belongs to the target product: dropping
          // the duplicate keeps one point per observation in history.
          await PriceSnapshotModel.deleteOne({ _id: documentId }, session ? { session } : {});
          deduped += 1;
          continue;
        }

        await PriceSnapshotModel.updateOne(
          { _id: documentId },
          { $set: { productId: options.targetProductId, observationKey: nextKey } },
          session ? { session } : {},
        );
        moved += 1;
      }

      return { moved, deduped };
    },

    async countForProduct(productId: string): Promise<number> {
      return PriceSnapshotModel.countDocuments({ productId });
    },

    async deleteRange(query: {
      readonly from: Date;
      readonly to: Date;
      readonly limit: number;
    }): Promise<number> {
      const ids = await PriceSnapshotModel.find({
        capturedAt: { $gte: query.from, $lt: query.to },
      })
        .sort({ capturedAt: 1, observationKey: 1 })
        .limit(query.limit)
        .select({ _id: 1 })
        .lean<{ _id: unknown }[]>();

      if (ids.length === 0) return 0;

      const result = await PriceSnapshotModel.deleteMany({
        _id: { $in: ids.map((document) => document._id) },
      });
      return result.deletedCount ?? 0;
    },
  };
}

function toRecord(document: PriceSnapshotFields): SnapshotRecord {
  // `_id` is not part of the domain record; paging uses the observation key.
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
