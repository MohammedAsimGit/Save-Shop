import {
  PriceDailyRollupModel,
  type PriceDailyRollupFields,
} from '../../models/priceDailyRollup.js';
import {
  compareRollups,
  type RollupInsertResult,
  type RollupListQuery,
  type RollupRecord,
  type RollupStore,
} from './rollupStore.js';

/**
 * MongoDB rollup store.
 *
 * Normal writes use `$setOnInsert` upserts, so re-running the compaction job costs
 * one round trip and never rewrites an existing day. `replaceDay` is the only
 * path that can change stored aggregates, and only when explicitly requested.
 */
export function createMongoRollupStore(): RollupStore {
  return {
    kind: 'mongodb',

    async insertMany(rollups: readonly RollupRecord[]): Promise<RollupInsertResult> {
      if (rollups.length === 0) return { inserted: 0, existing: 0 };

      const result = await PriceDailyRollupModel.bulkWrite(
        rollups.map((rollup) => ({
          updateOne: {
            filter: { rollupKey: rollup.rollupKey },
            update: { $setOnInsert: rollup },
            upsert: true,
          },
        })),
        { ordered: false },
      );

      const inserted = result.upsertedCount ?? 0;
      return { inserted, existing: rollups.length - inserted };
    },

    async replaceDay(
      dateKey: string,
      rollups: readonly RollupRecord[],
    ): Promise<RollupInsertResult & { deleted: number }> {
      const deleted = await PriceDailyRollupModel.deleteMany({ dateKey }).then(
        (result) => result.deletedCount ?? 0,
      );

      if (rollups.length === 0) return { deleted, inserted: 0, existing: 0 };
      await PriceDailyRollupModel.insertMany(rollups, { ordered: false });
      return { deleted, inserted: rollups.length, existing: 0 };
    },

    async listForDay(dateKey: string): Promise<RollupRecord[]> {
      const documents = await PriceDailyRollupModel.find({ dateKey }).lean<
        PriceDailyRollupFields[]
      >();
      return documents.map(toRecord).sort(compareRollups);
    },

    async list(query: RollupListQuery): Promise<RollupRecord[]> {
      const filter: Record<string, unknown> = {
        productId: query.productId,
        dateKey: { $gte: query.fromDate, $lte: query.toDate },
      };
      if (query.sourceId) filter.sourceId = query.sourceId;
      if (query.marketplaceId) filter.marketplaceId = query.marketplaceId;

      const documents = await PriceDailyRollupModel.find(filter)
        .sort({ dateKey: 1, marketplaceId: 1, sourceId: 1 })
        .limit(query.limit)
        .lean<PriceDailyRollupFields[]>();

      return documents.map(toRecord);
    },

    async countOlderThan(dateKey: string): Promise<number> {
      return PriceDailyRollupModel.countDocuments({ dateKey: { $lt: dateKey } });
    },

    async deleteOlderThan(dateKey: string, limit: number): Promise<number> {
      const ids = await PriceDailyRollupModel.find({ dateKey: { $lt: dateKey } })
        .sort({ dateKey: 1, rollupKey: 1 })
        .limit(limit)
        .select({ _id: 1 })
        .lean<{ _id: unknown }[]>();

      if (ids.length === 0) return 0;

      const result = await PriceDailyRollupModel.deleteMany({
        _id: { $in: ids.map((document) => document._id) },
      });
      return result.deletedCount ?? 0;
    },
  };
}

function toRecord(document: PriceDailyRollupFields): RollupRecord {
  return {
    rollupKey: document.rollupKey,
    productId: document.productId,
    sourceId: document.sourceId,
    marketplaceId: document.marketplaceId,
    currency: document.currency,
    dateKey: document.dateKey,
    date: new Date(document.date),
    windowStart: new Date(document.windowStart),
    windowEnd: new Date(document.windowEnd),
    minPrice: { amountMinor: document.minPrice.amountMinor, currency: document.minPrice.currency },
    maxPrice: { amountMinor: document.maxPrice.amountMinor, currency: document.maxPrice.currency },
    firstPrice: {
      amountMinor: document.firstPrice.amountMinor,
      currency: document.firstPrice.currency,
    },
    lastPrice: {
      amountMinor: document.lastPrice.amountMinor,
      currency: document.lastPrice.currency,
    },
    observationCount: document.observationCount,
    availabilityCounts: {
      inStock: document.availabilityCounts.inStock,
      outOfStock: document.availabilityCounts.outOfStock,
      preorder: document.availabilityCounts.preorder,
      unknown: document.availabilityCounts.unknown,
    },
    sourceVerification: document.sourceVerification,
    isSample: document.isSample,
    generatedAt: new Date(document.generatedAt),
  };
}
