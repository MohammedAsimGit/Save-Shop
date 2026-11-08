import { createHash } from 'node:crypto';

import type { Money } from '@smart-shopping/shared';

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
