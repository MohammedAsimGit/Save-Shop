import { createHash } from 'node:crypto';

import { offerSnapshotSchema, type MarketSource, type OfferSnapshot } from '@smart-shopping/shared';

/**
 * Snapshot storage abstraction.
 *
 * The comparison engine knows nothing about storage; the API service queries
 * adapters, then hands validated observations to a `SnapshotStore`. Two
 * implementations exist: MongoDB for real runs and an in-memory store for tests
 * and for development without a database. Neither imports Mongoose except the
 * Mongo implementation, so ranking and history logic stay storage-independent.
 */

/** Where a stored observation came from, copied onto the document at ingest. */
export type StoredVerification = 'verified' | 'sample';

export interface SnapshotRecord {
  readonly observationKey: string;
  readonly productId: string;
  readonly marketplaceId: string;
  readonly sourceId: string;
  readonly productUrl: string;
  readonly price: { readonly amountMinor: number; readonly currency: string };
  readonly availability: OfferSnapshot['availability'];
  readonly capturedAt: Date;
  readonly ttlSeconds: number;
  readonly expiresAt: Date;
  readonly attribution: OfferSnapshot['attribution'];
  readonly sourceVerification: StoredVerification;
  readonly isSample: boolean;
  readonly ingestedAt: Date;
}

export interface SnapshotWriteContext {
  /** Registered sources; anything else is rejected at ingest. */
  readonly sources: readonly MarketSource[];
  readonly now: Date;
  /**
   * Demo observations may be stored for local development, but a production
   * deployment must not accumulate invented prices (see Sprint 3 report).
   */
  readonly includeSampleSources: boolean;
}

export interface SnapshotWriteResult {
  /** Newly inserted observations. */
  readonly stored: number;
  /** Observations that already existed; ingestion is idempotent. */
  readonly duplicates: number;
  /** Rejected because they failed the contract or named an unknown/disabled source. */
  readonly rejected: number;
  /** Sample observations skipped by policy (`includeSampleSources: false`). */
  readonly skippedSample: number;
}

export interface SnapshotHistoryQuery {
  readonly productId: string;
  /** Inclusive window on `capturedAt`. */
  readonly from: Date;
  readonly to: Date;
  readonly sourceId?: string;
  readonly marketplaceId?: string;
  /** Maximum number of most-recent observations to return. */
  readonly limit: number;
}

export interface StoredSnapshot {
  readonly snapshot: OfferSnapshot;
  readonly sourceVerification: StoredVerification;
  readonly isSample: boolean;
  readonly ingestedAt: Date;
}

export interface SnapshotStore {
  readonly kind: 'memory' | 'mongodb';
  saveMany(
    rawSnapshots: readonly unknown[],
    context: SnapshotWriteContext,
  ): Promise<SnapshotWriteResult>;
  /** Most recent `limit` observations inside the window, oldest first. */
  listHistory(query: SnapshotHistoryQuery): Promise<StoredSnapshot[]>;
}

/**
 * Identity of an observation: the same provider response replayed must not create
 * a second point on a chart. `ingestedAt` is deliberately excluded - it is about
 * us, not about the price.
 */
export function observationKey(snapshot: OfferSnapshot): string {
  const identity = [
    snapshot.sourceId,
    snapshot.productId,
    snapshot.marketplaceId,
    String(snapshot.price.amountMinor),
    snapshot.price.currency,
    snapshot.availability,
    new Date(snapshot.capturedAt).toISOString(),
  ].join('|');

  return createHash('sha256').update(identity).digest('hex');
}

export interface PreparedSnapshots {
  readonly records: readonly SnapshotRecord[];
  readonly rejected: number;
  readonly skippedSample: number;
}

/**
 * Validates raw adapter output before it can reach storage.
 *
 * Rules, applied identically by every store implementation:
 * - the observation must satisfy `offerSnapshotSchema`;
 * - its `sourceId` must be a registered source, and that source must be enabled -
 *   a disabled adapter can never smuggle an observation into the database;
 * - sample observations are dropped when policy says not to persist them.
 */
export function prepareSnapshotRecords(
  rawSnapshots: readonly unknown[],
  context: SnapshotWriteContext,
): PreparedSnapshots {
  const sourcesById = new Map(context.sources.map((source) => [source.id, source]));
  const records: SnapshotRecord[] = [];
  let rejected = 0;
  let skippedSample = 0;

  for (const raw of rawSnapshots) {
    const parsed = offerSnapshotSchema.safeParse(raw);
    if (!parsed.success) {
      rejected += 1;
      continue;
    }

    const snapshot = parsed.data;
    const source = sourcesById.get(snapshot.sourceId);
    if (!source || !source.enabled) {
      rejected += 1;
      continue;
    }

    const isSample = source.verification === 'sample';
    if (isSample && !context.includeSampleSources) {
      skippedSample += 1;
      continue;
    }

    records.push({
      observationKey: observationKey(snapshot),
      productId: snapshot.productId,
      marketplaceId: snapshot.marketplaceId,
      sourceId: snapshot.sourceId,
      productUrl: snapshot.productUrl,
      price: { ...snapshot.price },
      availability: snapshot.availability,
      capturedAt: new Date(snapshot.capturedAt),
      ttlSeconds: snapshot.ttlSeconds,
      expiresAt: new Date(new Date(snapshot.capturedAt).getTime() + snapshot.ttlSeconds * 1000),
      attribution: { ...snapshot.attribution },
      sourceVerification: source.verification,
      isSample,
      ingestedAt: context.now,
    });
  }

  return { records, rejected, skippedSample };
}

/** Converts a stored record back into the transport contract. */
export function toStoredSnapshot(record: SnapshotRecord): StoredSnapshot {
  return {
    snapshot: {
      productId: record.productId,
      marketplaceId: record.marketplaceId,
      sourceId: record.sourceId,
      productUrl: record.productUrl,
      price: { ...record.price },
      availability: record.availability,
      capturedAt: record.capturedAt.toISOString(),
      ttlSeconds: record.ttlSeconds,
      attribution: { ...record.attribution },
    },
    sourceVerification: record.sourceVerification,
    isSample: record.isSample,
    ingestedAt: record.ingestedAt,
  };
}

/**
 * Shared memory-side filtering so both stores answer a history query the same way.
 * Returns the most recent `limit` observations, oldest first.
 */
export function selectHistoryRecords(
  records: readonly SnapshotRecord[],
  query: SnapshotHistoryQuery,
): SnapshotRecord[] {
  const fromMs = query.from.getTime();
  const toMs = query.to.getTime();

  const matching = records.filter((record) => {
    const capturedMs = record.capturedAt.getTime();
    if (record.productId !== query.productId) return false;
    if (capturedMs < fromMs || capturedMs > toMs) return false;
    if (query.sourceId && record.sourceId !== query.sourceId) return false;
    if (query.marketplaceId && record.marketplaceId !== query.marketplaceId) return false;
    return true;
  });

  matching.sort((a, b) => {
    const diff = a.capturedAt.getTime() - b.capturedAt.getTime();
    if (diff !== 0) return diff;
    return a.observationKey.localeCompare(b.observationKey);
  });

  return query.limit > 0 ? matching.slice(-query.limit) : matching;
}
