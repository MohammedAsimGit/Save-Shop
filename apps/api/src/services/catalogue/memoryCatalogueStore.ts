import { normalizeKey, type CanonicalProduct, type ReviewQueueQuery } from '@smart-shopping/shared';

import {
  buildSearchFields,
  isPendingReview,
  type CatalogueStore,
  type ListingReviewPatch,
  type ListingReviewResult,
  type ListingWriteResult,
  type MergeInspection,
  type MergeReferenceCounts,
  type ProductCandidateQuery,
  type ProductSearchCandidates,
  type ProductWriteResult,
  type ReviewQueueResult,
  type StoredListing,
} from './catalogueStore.js';

/**
 * In-memory catalogue store.
 *
 * Used when no MongoDB is configured (the documented development mode) and by unit
 * tests. It implements exactly the same candidate rules as the Mongo store; the two
 * being interchangeable is what lets matching be tested without a database.
 */

function productSearchKeys(product: CanonicalProduct): {
  readonly brandKey: string;
  readonly modelKey: string | null;
  readonly tokens: readonly string[];
} {
  const fields = buildSearchFields(product);
  return { brandKey: fields.brandKey, modelKey: fields.modelKey, tokens: fields.tokens };
}

function matchesQueueSearch(listing: StoredListing, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === '') return true;
  return [listing.title, listing.brand ?? '', listing.model ?? '', listing.externalId, listing.id]
    .join(' ')
    .toLowerCase()
    .includes(needle);
}

export function createMemoryCatalogueStore(): CatalogueStore {
  const products = new Map<string, CanonicalProduct>();
  const listings = new Map<string, StoredListing>();

  return {
    kind: 'memory',

    async upsertProducts(records: readonly CanonicalProduct[]): Promise<ProductWriteResult> {
      let inserted = 0;
      for (const record of records) {
        if (products.has(record.id)) continue;
        products.set(record.id, record);
        inserted += 1;
      }
      return { inserted, existing: records.length - inserted };
    },

    async findProduct(id: string): Promise<CanonicalProduct | null> {
      return products.get(id) ?? null;
    },

    async findListingsByIds(ids: readonly string[]): Promise<StoredListing[]> {
      return ids
        .map((id) => listings.get(id))
        .filter((listing): listing is StoredListing => listing !== undefined);
    },

    async findListing(id: string): Promise<StoredListing | null> {
      return listings.get(id) ?? null;
    },

    async listReviewQueue(query: ReviewQueueQuery): Promise<ReviewQueueResult> {
      const byVerdict: Record<StoredListing['match']['status'], number> = {
        exact: 0,
        strong: 0,
        possible: 0,
        unmatched: 0,
        conflict: 0,
      };

      let pending = 0;
      let decided = 0;
      let requiresReview = 0;

      const candidates: StoredListing[] = [];

      for (const listing of listings.values()) {
        const isPending = isPendingReview(listing);
        const isDecided = listing.review !== null && listing.review.decision !== 'reopened';
        if (isPending) {
          pending += 1;
          byVerdict[listing.match.status] += 1;
          if (listing.match.requiresReview) requiresReview += 1;
        }
        if (isDecided) decided += 1;

        if (query.scope === 'pending' && !isPending) continue;
        if (query.scope === 'decided' && !isDecided) continue;
        if (query.verdict && listing.match.status !== query.verdict) continue;
        if (query.sourceId && listing.sourceId !== query.sourceId) continue;
        if (query.marketplaceId && listing.marketplaceId !== query.marketplaceId) continue;
        if (query.canonicalProductId && listing.canonicalProductId !== query.canonicalProductId) {
          continue;
        }
        if (query.q && !matchesQueueSearch(listing, query.q)) continue;

        candidates.push(listing);
      }

      candidates.sort((a, b) => {
        switch (query.sort) {
          case 'newest':
            return b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id);
          case 'confidence_asc':
            return a.match.confidence - b.match.confidence || a.id.localeCompare(b.id);
          case 'confidence_desc':
            return b.match.confidence - a.match.confidence || a.id.localeCompare(b.id);
          default:
            return a.updatedAt.localeCompare(b.updatedAt) || a.id.localeCompare(b.id);
        }
      });

      const start = (query.page - 1) * query.pageSize;

      return {
        listings: candidates.slice(start, start + query.pageSize),
        totalItems: candidates.length,
        counts: { pending, decided, requiresReview, byVerdict },
      };
    },

    async applyReview(
      listingId: string,
      expectedRevision: number,
      patch: ListingReviewPatch,
    ): Promise<ListingReviewResult> {
      const prior = listings.get(listingId);
      if (!prior) return { status: 'not_found' };
      if (prior.revision !== expectedRevision) {
        return { status: 'conflict', currentRevision: prior.revision };
      }

      const rejected = new Set(prior.review?.rejectedProductIds ?? []);
      if (patch.rejectedProductId) rejected.add(patch.rejectedProductId);
      // Resolving a listing to a previously rejected candidate is an explicit
      // administrative reversal, so that candidate is no longer refused.
      if (patch.canonicalProductId) rejected.delete(patch.canonicalProductId);

      const updated: StoredListing = {
        ...prior,
        canonicalProductId: patch.canonicalProductId,
        match: {
          status: patch.match.status,
          method: patch.match.method,
          confidence: patch.match.confidence,
          requiresReview: patch.match.requiresReview,
          reasons: [...patch.match.reasons],
        },
        revision: prior.revision + 1,
        review:
          patch.decision === 'reopened'
            ? null
            : {
                decision: patch.decision,
                decidedBy: patch.decidedBy,
                decidedAt: patch.decidedAt.toISOString(),
                reason: patch.reason,
                notes: patch.notes,
                previousStatus: patch.previousStatus,
                previousCanonicalProductId: patch.previousCanonicalProductId,
                rejectedProductIds: [...rejected],
                matcherVersion: patch.matcherVersion,
              },
        updatedAt: patch.decidedAt.toISOString(),
      };

      listings.set(listingId, updated);
      return { status: 'applied', listing: updated };
    },

    async inspectMerge(productId: string): Promise<MergeInspection> {
      return {
        listings: [...listings.values()].filter(
          (listing) => listing.canonicalProductId === productId,
        ).length,
        variants: [...products.values()].filter((product) => product.variantOf === productId)
          .length,
      };
    },

    async mergeProductReferences(options: {
      readonly sourceProductId: string;
      readonly targetProductId: string;
      readonly mergedAt: Date;
    }): Promise<MergeReferenceCounts> {
      let movedListings = 0;
      for (const [id, listing] of listings) {
        if (listing.canonicalProductId !== options.sourceProductId) continue;
        listings.set(id, { ...listing, canonicalProductId: options.targetProductId });
        movedListings += 1;
      }

      let movedVariants = 0;
      for (const [id, product] of products) {
        if (product.variantOf !== options.sourceProductId) continue;
        products.set(id, { ...product, variantOf: options.targetProductId });
        movedVariants += 1;
      }

      const source = products.get(options.sourceProductId);
      if (source) {
        products.set(source.id, {
          ...source,
          status: 'archived',
          mergedInto: options.targetProductId,
          mergedAt: options.mergedAt.toISOString(),
          updatedAt: options.mergedAt.toISOString(),
        });
      }

      return { listings: movedListings, variants: movedVariants };
    },

    async findCandidates(query: ProductCandidateQuery): Promise<CanonicalProduct[]> {
      const excluded = new Set(query.excludeIds ?? []);
      const brandKey = query.brandKey;
      const nameTokens = query.nameTokens ?? [];

      const matches = [...products.values()].filter((product) => {
        if (excluded.has(product.id)) return false;
        const keys = productSearchKeys(product);

        if (query.gtin && product.gtin === query.gtin) return true;
        if (query.mpn && product.mpn === query.mpn) return true;
        if (brandKey && keys.brandKey === brandKey) return true;
        if (nameTokens.length > 0) {
          return nameTokens.some((token) => keys.tokens.includes(token));
        }
        return false;
      });

      return matches
        .sort((a, b) => a.id.localeCompare(b.id))
        .slice(0, query.limit)
        .map((product) => product);
    },

    async searchCandidates(query: ProductSearchCandidates): Promise<CanonicalProduct[]> {
      const brandKey = query.brandKey;
      const tokens = query.tokens;

      return [...products.values()]
        .filter((product) => {
          if (product.status !== query.status) return false;
          if (query.category && product.category !== query.category) return false;
          const keys = productSearchKeys(product);
          if (brandKey && keys.brandKey !== brandKey) return false;
          if (tokens.length > 0 && !tokens.some((token) => keys.tokens.includes(token))) {
            return false;
          }
          return true;
        })
        .sort((a, b) => a.id.localeCompare(b.id))
        .slice(0, query.limit);
    },

    async countProducts(): Promise<number> {
      return products.size;
    },

    async upsertListings(records: readonly StoredListing[]): Promise<ListingWriteResult> {
      let created = 0;
      let updated = 0;
      let unchanged = 0;
      let respectedHumanDecisions = 0;

      for (const record of records) {
        const prior = listings.get(record.id);
        if (!prior) {
          listings.set(record.id, record);
          created += 1;
          continue;
        }

        // Mirrors the MongoDB store: a human decision outranks the matcher, so a
        // re-ingestion refreshes facts without re-resolving the listing.
        const protectedDecision = prior.review !== null && prior.review.decision !== 'reopened';
        if (protectedDecision) respectedHumanDecisions += 1;

        if (prior.contentHash === record.contentHash) {
          unchanged += 1;
          continue;
        }

        listings.set(record.id, {
          ...record,
          ...(protectedDecision
            ? { canonicalProductId: prior.canonicalProductId, match: prior.match }
            : {}),
          review: prior.review,
          revision: prior.revision,
        });
        updated += 1;
      }

      return {
        created,
        updated,
        unchanged,
        ...(respectedHumanDecisions > 0 ? { respectedHumanDecisions } : {}),
      };
    },

    async listListings(productId: string, limit: number): Promise<StoredListing[]> {
      return [...listings.values()]
        .filter((listing) => listing.canonicalProductId === productId)
        .sort((a, b) =>
          a.marketplaceId === b.marketplaceId
            ? a.sourceId.localeCompare(b.sourceId)
            : a.marketplaceId.localeCompare(b.marketplaceId),
        )
        .slice(0, limit);
    },

    async countListings(): Promise<number> {
      return listings.size;
    },

    async countUnresolvedListings(): Promise<number> {
      return [...listings.values()].filter((listing) => listing.canonicalProductId === null).length;
    },
  };
}

/** Normalizes a brand for lookup without importing Mongo-specific helpers. */
export function brandKeyOf(brand: string): string {
  return normalizeKey(brand);
}
