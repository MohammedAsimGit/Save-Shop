import { createHash } from 'node:crypto';

import type { Money } from '@smart-shopping/shared';

import type { StoreSession } from '../storeSession.js';

/**
 * Daily rollup storage abstraction.
 *
 * The rollup service owns aggregation; a `RollupStore` only persists and reads the
 * results. Two implementations exist (MongoDB and memory) and both are
 * **insert-only** for normal writes: a rerun of the job must never replace a
 * completed day with a smaller count, because that is how a partially deleted day
 * would silently rewrite history. Recomputing a day is an explicit `replaceDay`.
 */

export interface RollupRecord {
  /** sha256 of the group identity; the idempotency key. */
  readonly rollupKey: string;
  readonly productId: string;
  readonly sourceId: string;
  readonly marketplaceId: string;
  readonly currency: string;
  /** UTC calendar date, `YYYY-MM-DD`. */
  readonly dateKey: string;
  /** Start of the UTC day. */
  readonly date: Date;
  readonly windowStart: Date;
  readonly windowEnd: Date;
  readonly minPrice: Money;
  readonly maxPrice: Money;
  readonly firstPrice: Money;
  readonly lastPrice: Money;
  readonly observationCount: number;
  readonly availabilityCounts: {
    readonly inStock: number;
    readonly outOfStock: number;
    readonly preorder: number;
    readonly unknown: number;
  };
  readonly sourceVerification: 'verified' | 'sample';
  readonly isSample: boolean;
  readonly generatedAt: Date;
}

export interface RollupListQuery {
  readonly productId: string;
  /** Inclusive date keys. */
  readonly fromDate: string;
  readonly toDate: string;
  readonly sourceId?: string;
  readonly marketplaceId?: string;
  readonly limit: number;
}

export interface RollupInsertResult {
  readonly inserted: number;
  /** Rows that already existed; generation is idempotent. */
  readonly existing: number;
}

export interface RollupStore {
  readonly kind: 'memory' | 'mongodb';
  /** Insert-only: existing documents are left untouched. */
  insertMany(rollups: readonly RollupRecord[]): Promise<RollupInsertResult>;
  /** Explicit recompute of one day: removes that day's rollups, then inserts. */
  replaceDay(
    dateKey: string,
    rollups: readonly RollupRecord[],
  ): Promise<RollupInsertResult & { deleted: number }>;
  listForDay(dateKey: string): Promise<RollupRecord[]>;
  list(query: RollupListQuery): Promise<RollupRecord[]>;
  countOlderThan(dateKey: string): Promise<number>;
  /** Deletes rollups older than `dateKey`, at most `limit` per call. */
  deleteOlderThan(dateKey: string, limit: number): Promise<number>;
  /**
   * Moves a product's daily aggregates to its merge target.
   *
   * Two products merged into one can share a (source, marketplace, currency,
   * provenance, day) group. Those rows are combined rather than duplicated: counts
   * add up, the minimum and maximum span both, and first/last come from the earlier
   * and later window respectively. A merge must not rewrite price history into a
   * shape the aggregation rules could never produce.
   */
  mergeProduct(options: {
    readonly sourceProductId: string;
    readonly targetProductId: string;
    readonly tx?: StoreSession;
  }): Promise<{ readonly moved: number; readonly combined: number }>;
  countForProduct(productId: string): Promise<number>;
}

/** Combines two rollups of the same group and day; `earlier` wins ties. */
export function combineRollups(earlier: RollupRecord, later: RollupRecord): RollupRecord {
  const [first, second] =
    earlier.windowStart.getTime() <= later.windowStart.getTime()
      ? [earlier, later]
      : [later, earlier];

  return {
    ...first,
    windowStart: new Date(Math.min(first.windowStart.getTime(), second.windowStart.getTime())),
    windowEnd: new Date(Math.max(first.windowEnd.getTime(), second.windowEnd.getTime())),
    minPrice:
      first.minPrice.amountMinor <= second.minPrice.amountMinor
        ? { ...first.minPrice }
        : { ...second.minPrice },
    maxPrice:
      first.maxPrice.amountMinor >= second.maxPrice.amountMinor
        ? { ...first.maxPrice }
        : { ...second.maxPrice },
    firstPrice: { ...first.firstPrice },
    lastPrice: { ...second.lastPrice },
    observationCount: first.observationCount + second.observationCount,
    availabilityCounts: {
      inStock: first.availabilityCounts.inStock + second.availabilityCounts.inStock,
      outOfStock: first.availabilityCounts.outOfStock + second.availabilityCounts.outOfStock,
      preorder: first.availabilityCounts.preorder + second.availabilityCounts.preorder,
      unknown: first.availabilityCounts.unknown + second.availabilityCounts.unknown,
    },
    generatedAt: new Date(Math.max(first.generatedAt.getTime(), second.generatedAt.getTime())),
  };
}

/** Stable identity of a rollup: product, source, marketplace, currency, provenance, day. */
export function rollupKey(parts: {
  readonly productId: string;
  readonly sourceId: string;
  readonly marketplaceId: string;
  readonly currency: string;
  readonly sourceVerification: 'verified' | 'sample';
  readonly dateKey: string;
}): string {
  const identity = [
    parts.productId,
    parts.sourceId,
    parts.marketplaceId,
    parts.currency,
    parts.sourceVerification,
    parts.dateKey,
  ].join('|');

  return createHash('sha256').update(identity).digest('hex');
}

/** Orders rollups deterministically: day, then marketplace, then source. */
export function compareRollups(a: RollupRecord, b: RollupRecord): number {
  if (a.dateKey !== b.dateKey) return a.dateKey.localeCompare(b.dateKey);
  if (a.marketplaceId !== b.marketplaceId) return a.marketplaceId.localeCompare(b.marketplaceId);
  return a.sourceId.localeCompare(b.sourceId);
}
