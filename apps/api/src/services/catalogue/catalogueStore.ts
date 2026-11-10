import { createHash } from 'node:crypto';

import {
  normalizeCapacity,
  normalizeColor,
  normalizeGtin,
  normalizeKey,
  normalizeMpn,
  normalizeText,
  type CanonicalProduct,
  type CatalogueSearchQuery,
  type CatalogueStatus,
  type MatchMethod,
  type MatchStatus,
  type MarketplaceListing,
  type ReviewQueueQuery,
} from '@smart-shopping/shared';

import type { StoreSession } from '../storeSession.js';

/**
 * Catalogue persistence abstraction.
 *
 * Two implementations exist (MongoDB and memory) and both must behave identically,
 * so the interesting logic - ranking, matching, dedupe rules - lives outside them.
 * A store only persists and reads canonical products and marketplace listings.
 *
 * Canonical products are insert-only through `upsertProducts`: a rerun of the demo
 * migration must never overwrite a curated record. Listings may be updated, because
 * a source is allowed to correct its own title or match verdict.
 */

/**
 * A listing as stored: the transport contract plus the internal change hash.
 * `contentHash` never leaves the API - the response schema strips unknown keys.
 */
export interface StoredListing extends MarketplaceListing {
  readonly contentHash: string;
}

export interface ProductWriteResult {
  readonly inserted: number;
  readonly existing: number;
}

export interface ListingWriteResult {
  readonly created: number;
  readonly updated: number;
  readonly unchanged: number;
  /** Listings whose existing human decision was preserved instead of re-matched. */
  readonly respectedHumanDecisions?: number;
}

export type { StoreSession } from '../storeSession.js';

/** One atomically applied administrative decision on a listing. */
export interface ListingReviewPatch {
  readonly decision: 'accepted' | 'rejected' | 'reassigned' | 'deferred' | 'reopened';
  readonly decidedBy: string;
  readonly decidedAt: Date;
  readonly reason: string;
  readonly notes: string | null;
  readonly matcherVersion: string;
  /** New canonical product for accepted/reassigned; null otherwise. */
  readonly canonicalProductId: string | null;
  /** Candidate a human refused (rejected only). */
  readonly rejectedProductId?: string;
  /** The verdict the human is overriding, captured for the audit trail. */
  readonly previousStatus: MatchStatus;
  readonly previousCanonicalProductId: string | null;
  /** Effective match recorded on the listing after the decision. */
  readonly match: {
    readonly status: MatchStatus;
    readonly method: MatchMethod;
    readonly confidence: number;
    readonly requiresReview: boolean;
    readonly reasons: readonly string[];
  };
}

export interface ListingReviewResult {
  readonly status: 'applied' | 'conflict' | 'not_found';
  readonly listing?: StoredListing;
  /** Revision the caller should retry from when the write conflicted. */
  readonly currentRevision?: number;
}

export interface ReviewQueueCounts {
  readonly pending: number;
  readonly decided: number;
  readonly requiresReview: number;
  readonly byVerdict: Readonly<Record<MatchStatus, number>>;
}

export interface ReviewQueueResult {
  readonly listings: readonly StoredListing[];
  readonly totalItems: number;
  readonly counts: ReviewQueueCounts;
}

export interface MergeReferenceCounts {
  readonly listings: number;
  readonly variants: number;
}

export interface MergeInspection {
  readonly listings: number;
  readonly variants: number;
}

/** Everything the matcher may look a product up by. All keys are normalized. */
export interface ProductCandidateQuery {
  readonly gtin?: string;
  readonly mpn?: string;
  readonly brandKey?: string;
  readonly modelKey?: string;
  /** Informative title tokens, used only for weak candidates. */
  readonly nameTokens?: readonly string[];
  readonly excludeIds?: readonly string[];
  readonly limit: number;
}

export interface ProductSearchCandidates {
  readonly query: CatalogueSearchQuery;
  readonly brandKey?: string;
  readonly category?: string;
  readonly status: CatalogueStatus;
  readonly tokens: readonly string[];
  readonly limit: number;
}

export interface CatalogueStore {
  readonly kind: 'memory' | 'mongodb';

  upsertProducts(products: readonly CanonicalProduct[]): Promise<ProductWriteResult>;
  findProduct(id: string): Promise<CanonicalProduct | null>;
  /** Batch lookup used by ingestion to honour existing human decisions. */
  findListingsByIds(ids: readonly string[]): Promise<StoredListing[]>;
  findListing(id: string): Promise<StoredListing | null>;
  /**
   * Rows a human must look at, filtered and paginated, plus the unfiltered counts
   * the queue header shows. Candidate scoring happens in the service.
   */
  listReviewQueue(query: ReviewQueueQuery): Promise<ReviewQueueResult>;
  /**
   * Compare-and-set on `revision`: two administrators acting on the same stale row
   * means the second one is told to reload, never that one silently wins.
   */
  applyReview(
    listingId: string,
    expectedRevision: number,
    patch: ListingReviewPatch,
  ): Promise<ListingReviewResult>;
  /** Counts used before a merge; no writes. */
  inspectMerge(productId: string): Promise<MergeInspection>;
  /**
   * Atomically claims the source product for one merge run.
   *
   * A conditional update is the concurrency guard: only one run can hold the claim,
   * so a second merge of the same source (into any target) is refused instead of
   * half-migrating the same rows. Re-claiming with the same `runId` is allowed, which
   * is what makes recovery idempotent; a source already archived into `targetId` by
   * the same run is also accepted so the re-applied steps are harmless no-ops.
   *
   * Returns false when another run owns the source or it is merged elsewhere.
   */
  claimMerge(options: {
    readonly sourceProductId: string;
    readonly targetProductId: string;
    readonly runId: string;
    readonly tx?: StoreSession;
  }): Promise<boolean>;
  /**
   * Moves listings and variant links to the target and archives the source.
   * `runId` makes the archive conditional on the caller still owning the claim.
   */
  mergeProductReferences(options: {
    readonly sourceProductId: string;
    readonly targetProductId: string;
    readonly mergedAt: Date;
    readonly runId: string;
    readonly tx?: StoreSession;
  }): Promise<MergeReferenceCounts>;
  /** Candidates for identity matching; never returns more than `limit`. */
  findCandidates(query: ProductCandidateQuery): Promise<CanonicalProduct[]>;
  /** Broad candidate set for search; ranking and pagination happen in the service. */
  searchCandidates(query: ProductSearchCandidates): Promise<CanonicalProduct[]>;
  countProducts(): Promise<number>;

  upsertListings(listings: readonly StoredListing[]): Promise<ListingWriteResult>;
  listListings(productId: string, limit: number): Promise<StoredListing[]>;
  countListings(): Promise<number>;
  /** Listings that are not attached to a canonical product and await review. */
  countUnresolvedListings(): Promise<number>;
}

/** Search keys stored alongside a product so queries never need a full scan. */
export interface ProductSearchFields {
  readonly text: string;
  readonly tokens: readonly string[];
  readonly brandKey: string;
  readonly modelKey: string | null;
}

export function buildSearchFields(
  product: Pick<CanonicalProduct, 'name' | 'brand' | 'model'>,
): ProductSearchFields {
  const text = normalizeText([product.name, product.brand, product.model ?? ''].join(' '));
  return {
    text,
    tokens: normalizeText(product.name)
      .split(' ')
      .filter((token) => token.length > 0),
    brandKey: normalizeKey(product.brand),
    modelKey: product.model ? normalizeKey(product.model) : null,
  };
}

/** Deterministic listing identity: one row per item, per source, per marketplace. */
export function listingKey(parts: {
  readonly sourceId: string;
  readonly marketplaceId: string;
  readonly externalId: string;
}): string {
  return createHash('sha256')
    .update([parts.sourceId, parts.marketplaceId, parts.externalId].join('|'))
    .digest('hex')
    .slice(0, 40);
}

/**
 * True while a listing still waits for a human. Shared by the memory store and the
 * review service so "is this row in the queue?" has exactly one definition; the
 * MongoDB store expresses the same rule in a query.
 */
export function isPendingReview(listing: StoredListing): boolean {
  const settled =
    listing.review?.decision === 'accepted' ||
    listing.review?.decision === 'reassigned' ||
    listing.review?.decision === 'rejected';
  if (settled) return false;
  return listing.canonicalProductId === null || listing.match.requiresReview;
}

/**
 * Hash of the facts a source can change. Deliberately excludes `lastObservedAt`,
 * `match` and timestamps: re-reading the same catalogue must be reported as
 * `unchanged` work, not as an update.
 */
export function listingContentHash(listing: Omit<StoredListing, 'contentHash'>): string {
  const content = {
    title: listing.title,
    url: listing.url,
    brand: listing.brand ?? null,
    model: listing.model ?? null,
    mpn: listing.mpn ?? null,
    gtin: listing.gtin ?? null,
    specifications: listing.specifications,
    imageUrl: listing.imageUrl ?? null,
    color: listing.color ?? null,
    storageCapacity: listing.storageCapacity ?? null,
  };

  return createHash('sha256').update(JSON.stringify(content)).digest('hex');
}

/** Canonical slug for a listing title when a human has not named the product yet. */
export function slugify(value: string): string {
  return normalizeText(value).replace(/\s+/g, '-').slice(0, 100) || 'product';
}

/**
 * Fills in the derived fields of a raw listing record. Normalization happens once,
 * here, so every store and the matcher see the same keys.
 */
export function normalizeListingInput(input: {
  readonly sourceId: string;
  readonly marketplaceId: string;
  readonly externalId: string;
  readonly title: string;
  readonly url: string;
  readonly brand?: string;
  readonly model?: string;
  readonly mpn?: string;
  readonly gtin?: string;
  readonly specifications: Readonly<Record<string, string>>;
  readonly imageUrl?: string;
  readonly color?: string;
  readonly storageCapacity?: string;
  readonly provenance: MarketplaceListing['provenance'];
  readonly isSample: boolean;
  readonly lastObservedAt: string;
  readonly now: Date;
}): {
  readonly gtin?: string;
  readonly mpn?: string;
  readonly color?: string;
  readonly storageCapacity?: string;
} {
  const gtin = input.gtin ? (normalizeGtin(input.gtin) ?? undefined) : undefined;
  const mpn = input.mpn ? normalizeMpn(input.mpn) : undefined;
  const color = input.color ? (normalizeColor(input.color) ?? input.color) : undefined;
  const capacity = input.storageCapacity
    ? (normalizeCapacity(input.storageCapacity) ?? input.storageCapacity)
    : undefined;

  return {
    ...(gtin ? { gtin } : {}),
    ...(mpn ? { mpn } : {}),
    ...(color ? { color } : {}),
    ...(capacity ? { storageCapacity: capacity } : {}),
  };
}
