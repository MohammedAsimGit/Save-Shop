import {
  normalizeCapacity,
  normalizeColor,
  normalizeGtin,
  normalizeKey,
  normalizeMpn,
  type CanonicalProduct,
  type MatchStatus,
  type MarketplaceListing,
} from '@smart-shopping/shared';
import type { Logger } from 'pino';

import {
  catalogueRecordSchema,
  type CanonicalProductInput,
  type CatalogueSource,
} from './catalogueSource.js';
import {
  listingContentHash,
  listingKey,
  type CatalogueStore,
  type StoredListing,
} from './catalogueStore.js';
import type { IdentityMatcher, MatchDecision } from './matching.service.js';

/**
 * Catalogue ingestion.
 *
 * Pipeline: read -> validate -> normalize -> dedupe -> match -> persist -> report.
 *
 * Guarantees:
 * - a record that fails validation is reported with its reason and never stored;
 * - the same source seen twice produces the same rows (deterministic listing ids
 *   and a unique database key), and unchanged content is reported as `unchanged`;
 * - a listing only points at a canonical product when the matcher returned `exact`
 *   or `strong`; `possible` and `conflict` stay unresolved for review;
 * - ingestion never creates a canonical product from a listing title.
 */

export interface RejectedRecord {
  readonly sourceId: string;
  readonly index: number;
  readonly externalId?: string;
  readonly reason: string;
}

export interface IngestionReport {
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly dryRun: boolean;
  readonly status: 'completed' | 'failed';
  readonly sources: readonly string[];
  readonly recordsRead: number;
  readonly accepted: number;
  readonly rejected: number;
  readonly created: number;
  readonly updated: number;
  readonly unchanged: number;
  readonly canonicalProductsAccepted: number;
  readonly canonicalProductsInserted: number;
  readonly canonicalProductsExisting: number;
  readonly matches: Readonly<Record<MatchStatus, number>>;
  readonly rejectedRecords: readonly RejectedRecord[];
  readonly warnings: readonly string[];
}

export interface IngestCatalogueOptions {
  readonly sources: readonly CatalogueSource[];
  readonly store: CatalogueStore;
  readonly matcher: IdentityMatcher;
  readonly now?: () => Date;
  readonly dryRun?: boolean;
  readonly logger?: Pick<Logger, 'info' | 'warn' | 'error'>;
  /** Audit hook; a failure to record must not fail the ingestion itself. */
  readonly recordRun?: (report: IngestionReport) => Promise<void>;
}

function emptyMatchCounts(): Record<MatchStatus, number> {
  return { exact: 0, strong: 0, possible: 0, unmatched: 0, conflict: 0 };
}

function toCanonicalProduct(input: CanonicalProductInput, timestamp: Date): CanonicalProduct {
  const createdAt = timestamp.toISOString();

  // Identifiers are normalized before storage: a value that cannot be a real
  // identifier is dropped rather than kept in a shape the matcher would trust.
  const gtin = input.gtin ? (normalizeGtin(input.gtin) ?? undefined) : undefined;
  const mpn = input.mpn ? normalizeMpn(input.mpn) : undefined;
  const color = input.color ? (normalizeColor(input.color) ?? input.color) : undefined;
  const storageCapacity = input.storageCapacity
    ? (normalizeCapacity(input.storageCapacity) ?? input.storageCapacity)
    : undefined;

  return {
    ...input,
    ...(gtin ? { gtin } : {}),
    ...(mpn ? { mpn } : {}),
    ...(color ? { color } : {}),
    ...(storageCapacity ? { storageCapacity } : {}),
    createdAt,
    updatedAt: createdAt,
  };
}

export async function ingestCatalogue(options: IngestCatalogueOptions): Promise<IngestionReport> {
  const clock = options.now ?? (() => new Date());
  const startedAt = clock();
  const dryRun = options.dryRun ?? false;
  const matches = emptyMatchCounts();
  const rejectedRecords: RejectedRecord[] = [];
  const warnings: string[] = [];

  let recordsRead = 0;
  let accepted = 0;
  let created = 0;
  let updated = 0;
  let unchanged = 0;
  let productsAccepted = 0;
  let productsInserted = 0;
  let productsExisting = 0;
  let failedSources = 0;

  for (const source of options.sources) {
    try {
      const result = await source.read();
      warnings.push(...result.warnings);

      const products = result.products.map((input) => toCanonicalProduct(input, startedAt));
      productsAccepted += products.length;
      // A trusted source may reference a product it declares in the same run; a dry
      // run still needs that lookup to be useful, and nothing is written for it.
      const declaredProducts = new Map(products.map((product) => [product.id, product]));

      if (!dryRun && products.length > 0) {
        const written = await options.store.upsertProducts(products);
        productsInserted += written.inserted;
        productsExisting += written.existing;
      }

      const listings: StoredListing[] = [];

      for (const [index, raw] of result.listings.entries()) {
        const parsed = catalogueRecordSchema.safeParse(raw);
        if (!parsed.success) {
          const detail = parsed.error.issues
            .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
            .join('; ');
          rejectedRecords.push({
            sourceId: source.id,
            index,
            reason: `invalid record: ${detail}`,
          });
          continue;
        }

        recordsRead += 1;
        const record = parsed.data;

        try {
          // Tier 0: an identity claim from a source that owns the catalogue. It is
          // still checked against the brand, and an unknown id is a rejection.
          const claimedId = source.trustsCanonicalIds ? record.canonicalProductId : undefined;
          let match: MatchDecision;

          if (claimedId) {
            const claimed =
              (await options.store.findProduct(claimedId)) ??
              declaredProducts.get(claimedId) ??
              null;
            if (!claimed) {
              rejectedRecords.push({
                sourceId: source.id,
                index,
                externalId: record.externalId,
                reason: `unknown canonical product id: ${claimedId}`,
              });
              continue;
            }

            const brandContradicts =
              record.brand !== undefined &&
              normalizeKey(record.brand) !== normalizeKey(claimed.brand);

            match = brandContradicts
              ? {
                  status: 'conflict',
                  method: 'canonical_id',
                  confidence: 10,
                  requiresReview: true,
                  reasons: ['the supplied canonical id contradicts the listing brand'],
                  canonicalProductId: null,
                }
              : {
                  status: 'exact',
                  method: 'canonical_id',
                  confidence: 100,
                  requiresReview: false,
                  reasons: ['canonical id supplied by a trusted catalogue source'],
                  canonicalProductId: claimed.id,
                };
          } else {
            match = await options.matcher.match({
              title: record.title,
              ...(record.brand ? { brand: record.brand } : {}),
              ...(record.model ? { model: record.model } : {}),
              ...(record.mpn ? { mpn: record.mpn } : {}),
              ...(record.gtin ? { gtin: record.gtin } : {}),
              ...(record.color ? { color: record.color } : {}),
              ...(record.storageCapacity ? { storageCapacity: record.storageCapacity } : {}),
            });
          }

          matches[match.status] += 1;
          accepted += 1;

          const nowIso = startedAt.toISOString();
          const normalizedGtin = record.gtin ? normalizeGtin(record.gtin) : null;
          const normalizedMpn = record.mpn ? normalizeMpn(record.mpn) : undefined;
          const color = record.color ? (normalizeColor(record.color) ?? record.color) : undefined;
          const storageCapacity = record.storageCapacity
            ? (normalizeCapacity(record.storageCapacity) ?? record.storageCapacity)
            : undefined;

          const base: Omit<StoredListing, 'contentHash'> = {
            id: listingKey({
              sourceId: source.id,
              marketplaceId: record.marketplaceId,
              externalId: record.externalId,
            }),
            canonicalProductId: match.canonicalProductId,
            sourceId: source.id,
            marketplaceId: record.marketplaceId,
            externalId: record.externalId,
            title: record.title,
            url: record.url,
            ...(record.brand ? { brand: record.brand } : {}),
            ...(record.model ? { model: record.model } : {}),
            ...(normalizedMpn ? { mpn: normalizedMpn } : {}),
            ...(normalizedGtin ? { gtin: normalizedGtin } : {}),
            specifications: record.specifications,
            ...(record.imageUrl ? { imageUrl: record.imageUrl } : {}),
            ...(color ? { color } : {}),
            ...(storageCapacity ? { storageCapacity } : {}),
            provenance: source.provenance,
            isSample: source.isSample,
            match: {
              status: match.status,
              method: match.method,
              confidence: match.confidence,
              requiresReview: match.requiresReview,
              reasons: [...match.reasons],
            },
            lastObservedAt: record.lastObservedAt ?? nowIso,
            createdAt: nowIso,
            updatedAt: nowIso,
          } satisfies Omit<StoredListing, 'contentHash'>;

          listings.push({ ...base, contentHash: listingContentHash(base) });
        } catch (error) {
          rejectedRecords.push({
            sourceId: source.id,
            index,
            externalId: record.externalId,
            reason: `matching failed: ${error instanceof Error ? error.message : 'unknown error'}`,
          });
        }
      }

      if (!dryRun && listings.length > 0) {
        const written = await options.store.upsertListings(listings);
        created += written.created;
        updated += written.updated;
        unchanged += written.unchanged;
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'unknown error';
      failedSources += 1;
      options.logger?.error({ err: error, sourceId: source.id }, 'Catalogue source failed');
      warnings.push(`Source ${source.id} could not be read: ${detail}`);
    }
  }

  // A run where every source failed read nothing at all. Reporting it as
  // `completed` would tell an operator that ingestion ran when nothing was seen,
  // so it is `failed` (and the CLI exits non-zero). Partial failure stays
  // `completed` with a warning: the records that were read really were ingested.
  const allSourcesFailed = options.sources.length > 0 && failedSources === options.sources.length;

  const report: IngestionReport = {
    startedAt: startedAt.toISOString(),
    finishedAt: clock().toISOString(),
    dryRun,
    status: allSourcesFailed ? 'failed' : 'completed',
    sources: options.sources.map((source) => source.id),
    recordsRead,
    accepted,
    rejected: rejectedRecords.length,
    created,
    updated,
    unchanged,
    canonicalProductsAccepted: productsAccepted,
    canonicalProductsInserted: productsInserted,
    canonicalProductsExisting: productsExisting,
    matches,
    rejectedRecords,
    warnings: [...new Set(warnings)],
  };

  if (options.recordRun) {
    try {
      await options.recordRun(report);
    } catch (error) {
      options.logger?.warn({ err: error }, 'Could not record the catalogue ingestion run');
    }
  }

  options.logger?.info(
    {
      status: report.status,
      dryRun,
      recordsRead,
      accepted,
      rejected: rejectedRecords.length,
      created,
      updated,
      unchanged,
      matches,
    },
    'Catalogue ingestion finished',
  );

  return report;
}

/** Convenience wrapper used by bootstrapping and the CLI. */
export async function ingestDemoCatalogue(options: {
  readonly store: CatalogueStore;
  readonly matcher: IdentityMatcher;
  readonly now?: () => Date;
  readonly dryRun?: boolean;
  readonly logger?: IngestCatalogueOptions['logger'];
  readonly recordRun?: IngestCatalogueOptions['recordRun'];
}): Promise<IngestionReport> {
  const { createDemoCatalogueSource } = await import('./catalogueSource.js');

  return ingestCatalogue({
    sources: [createDemoCatalogueSource()],
    store: options.store,
    matcher: options.matcher,
    ...(options.now ? { now: options.now } : {}),
    ...(options.dryRun === undefined ? {} : { dryRun: options.dryRun }),
    ...(options.logger ? { logger: options.logger } : {}),
    ...(options.recordRun ? { recordRun: options.recordRun } : {}),
  });
}

/** Listings that a human has to look at before they can be compared. */
export function needsReview(listing: MarketplaceListing): boolean {
  return listing.match.requiresReview || listing.canonicalProductId === null;
}
