import type { ClientSession } from 'mongoose';

import type {
  CanonicalProduct,
  MarketplaceListing,
  ReviewQueueQuery,
} from '@smart-shopping/shared';

import {
  CanonicalProductModel,
  type CanonicalProductFields,
} from '../../models/canonicalProduct.js';
import {
  MarketplaceListingModel,
  type MarketplaceListingFields,
} from '../../models/marketplaceListing.js';
import { AppError } from '../../utils/AppError.js';
import {
  buildSearchFields,
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
  type StoreSession,
  type StoredListing,
} from './catalogueStore.js';

/** Narrows the opaque store transaction to a Mongoose session. */
function sessionOf(tx: StoreSession | undefined): ClientSession | undefined {
  return tx as ClientSession | undefined;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * One row is pending until a human settles it. Expressed once here and mirrored in
 * the memory store, so the queue cannot disagree between storage engines.
 */
const SETTLED_DECISIONS = ['accepted', 'reassigned', 'rejected'] as const;

function pendingFilter(): Record<string, unknown> {
  return {
    $and: [
      { $or: [{ canonicalProductId: null }, { 'match.requiresReview': true }] },
      { 'review.decision': { $nin: [...SETTLED_DECISIONS] } },
    ],
  };
}

function decidedFilter(): Record<string, unknown> {
  return { 'review.decision': { $in: [...SETTLED_DECISIONS, 'deferred'] } };
}

/**
 * MongoDB catalogue store.
 *
 * Candidate lookups use the indexes created by the models: an exact GTIN, an exact
 * MPN, a brand key, or a shared name token. Nothing here scores anything - that is
 * the matcher's job - so the same query is answerable in the memory store too.
 */

function toDomainProduct(document: CanonicalProductFields): CanonicalProduct {
  return {
    id: document.id,
    name: document.name,
    brand: document.brand,
    category: document.category,
    ...(document.model ? { model: document.model } : {}),
    ...(document.mpn ? { mpn: document.mpn } : {}),
    ...(document.gtin ? { gtin: document.gtin } : {}),
    ...(document.description ? { description: document.description } : {}),
    specifications: (document.specifications ?? {}) as Record<string, string>,
    ...(document.color ? { color: document.color } : {}),
    ...(document.storageCapacity ? { storageCapacity: document.storageCapacity } : {}),
    variantOf: document.variantOf ?? null,
    variantAttributes: (document.variantAttributes ?? {}) as Record<string, string>,
    imageUrls: [...(document.imageUrls ?? [])],
    status: document.status as CanonicalProduct['status'],
    provenance: document.provenance as CanonicalProduct['provenance'],
    isSample: document.isSample,
    mergedInto: document.mergedInto ?? null,
    mergedAt: document.mergedAt ? new Date(document.mergedAt).toISOString() : null,
    createdAt: new Date(document.createdAt).toISOString(),
    updatedAt: new Date(document.updatedAt).toISOString(),
  };
}

function toDomainListing(document: MarketplaceListingFields): StoredListing {
  return {
    id: document.id,
    canonicalProductId: document.canonicalProductId ?? null,
    sourceId: document.sourceId,
    marketplaceId: document.marketplaceId,
    externalId: document.externalId,
    title: document.title,
    url: document.url,
    ...(document.brand ? { brand: document.brand } : {}),
    ...(document.model ? { model: document.model } : {}),
    ...(document.mpn ? { mpn: document.mpn } : {}),
    ...(document.gtin ? { gtin: document.gtin } : {}),
    specifications: (document.specifications ?? {}) as Record<string, string>,
    ...(document.imageUrl ? { imageUrl: document.imageUrl } : {}),
    ...(document.color ? { color: document.color } : {}),
    ...(document.storageCapacity ? { storageCapacity: document.storageCapacity } : {}),
    provenance: document.provenance as MarketplaceListing['provenance'],
    isSample: document.isSample,
    match: {
      status: document.match.status as MarketplaceListing['match']['status'],
      method: document.match.method as MarketplaceListing['match']['method'],
      confidence: document.match.confidence,
      requiresReview: document.match.requiresReview,
      reasons: [...(document.match.reasons ?? [])],
    },
    revision: document.revision ?? 0,
    review: document.review
      ? {
          decision: document.review.decision as NonNullable<
            MarketplaceListing['review']
          >['decision'],
          decidedBy: document.review.decidedBy,
          decidedAt: new Date(document.review.decidedAt).toISOString(),
          reason: document.review.reason,
          notes: document.review.notes ?? null,
          previousStatus: document.review.previousStatus as NonNullable<
            MarketplaceListing['review']
          >['previousStatus'],
          previousCanonicalProductId: document.review.previousCanonicalProductId ?? null,
          rejectedProductIds: [...(document.review.rejectedProductIds ?? [])],
          matcherVersion: document.review.matcherVersion,
        }
      : null,
    lastObservedAt: new Date(document.lastObservedAt).toISOString(),
    contentHash: document.contentHash,
    createdAt: new Date(document.createdAt).toISOString(),
    updatedAt: new Date(document.updatedAt).toISOString(),
  };
}

export function createMongoCatalogueStore(): CatalogueStore {
  return {
    kind: 'mongodb',

    async upsertProducts(records: readonly CanonicalProduct[]): Promise<ProductWriteResult> {
      if (records.length === 0) return { inserted: 0, existing: 0 };

      const existing = await CanonicalProductModel.find({ id: { $in: records.map((r) => r.id) } })
        .select({ id: 1 })
        .lean<{ id: string }[]>();
      const known = new Set(existing.map((document) => document.id));
      const fresh = records.filter((record) => !known.has(record.id));

      if (fresh.length > 0) {
        await CanonicalProductModel.bulkWrite(
          fresh.map((product) => ({
            updateOne: {
              filter: { id: product.id },
              update: {
                $setOnInsert: {
                  ...product,
                  search: buildSearchFields(product),
                  createdAt: new Date(product.createdAt),
                  updatedAt: new Date(product.updatedAt),
                },
              },
              upsert: true,
            },
          })),
          { ordered: false },
        );
      }

      return { inserted: fresh.length, existing: records.length - fresh.length };
    },

    async findProduct(id: string): Promise<CanonicalProduct | null> {
      const document = await CanonicalProductModel.findOne({ id }).lean<CanonicalProductFields>();
      return document ? toDomainProduct(document) : null;
    },

    async findListingsByIds(ids: readonly string[]): Promise<StoredListing[]> {
      if (ids.length === 0) return [];
      const documents = await MarketplaceListingModel.find({ id: { $in: [...ids] } }).lean<
        MarketplaceListingFields[]
      >();
      return documents.map(toDomainListing);
    },

    async findListing(id: string): Promise<StoredListing | null> {
      const document = await MarketplaceListingModel.findOne({
        id,
      }).lean<MarketplaceListingFields>();
      return document ? toDomainListing(document) : null;
    },

    async listReviewQueue(query: ReviewQueueQuery): Promise<ReviewQueueResult> {
      const filters: Record<string, unknown>[] = [];

      if (query.scope === 'pending') filters.push(pendingFilter());
      if (query.scope === 'decided') filters.push(decidedFilter());
      if (query.verdict) filters.push({ 'match.status': query.verdict });
      if (query.sourceId) filters.push({ sourceId: query.sourceId });
      if (query.marketplaceId) filters.push({ marketplaceId: query.marketplaceId });
      if (query.canonicalProductId) filters.push({ canonicalProductId: query.canonicalProductId });
      if (query.q) {
        const pattern = new RegExp(escapeRegex(query.q), 'i');
        filters.push({
          $or: [
            { title: pattern },
            { brand: pattern },
            { model: pattern },
            { externalId: pattern },
            { id: pattern },
          ],
        });
      }

      const filter = filters.length > 0 ? { $and: filters } : {};
      const sort: Record<string, 1 | -1> =
        query.sort === 'newest'
          ? { updatedAt: -1, id: 1 }
          : query.sort === 'confidence_asc'
            ? { 'match.confidence': 1, id: 1 }
            : query.sort === 'confidence_desc'
              ? { 'match.confidence': -1, id: 1 }
              : { updatedAt: 1, id: 1 };

      const [documents, totalItems, pending, decided, requiresReview, verdictCounts] =
        await Promise.all([
          MarketplaceListingModel.find(filter)
            .sort(sort)
            .skip((query.page - 1) * query.pageSize)
            .limit(query.pageSize)
            .lean<MarketplaceListingFields[]>(),
          MarketplaceListingModel.countDocuments(filter),
          MarketplaceListingModel.countDocuments(pendingFilter()),
          MarketplaceListingModel.countDocuments(decidedFilter()),
          MarketplaceListingModel.countDocuments({
            $and: [pendingFilter(), { 'match.requiresReview': true }],
          }),
          MarketplaceListingModel.aggregate<{ _id: string; count: number }>([
            { $match: pendingFilter() },
            { $group: { _id: '$match.status', count: { $sum: 1 } } },
          ]),
        ]);

      const byVerdict: Record<StoredListing['match']['status'], number> = {
        exact: 0,
        strong: 0,
        possible: 0,
        unmatched: 0,
        conflict: 0,
      };
      for (const row of verdictCounts) {
        if (row._id in byVerdict) byVerdict[row._id as keyof typeof byVerdict] = row.count;
      }

      return {
        listings: documents.map(toDomainListing),
        totalItems,
        counts: { pending, decided, requiresReview, byVerdict },
      };
    },

    async applyReview(
      listingId: string,
      expectedRevision: number,
      patch: ListingReviewPatch,
    ): Promise<ListingReviewResult> {
      const prior = await MarketplaceListingModel.findOne({
        id: listingId,
      }).lean<MarketplaceListingFields>();
      if (!prior) return { status: 'not_found' };

      const rejected = new Set<string>(prior.review?.rejectedProductIds ?? []);
      if (patch.rejectedProductId) rejected.add(patch.rejectedProductId);
      // A human resolving the listing to a refused candidate reverses that refusal.
      if (patch.canonicalProductId) rejected.delete(patch.canonicalProductId);

      const review =
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
            };

      const updated = await MarketplaceListingModel.findOneAndUpdate(
        { id: listingId, revision: expectedRevision },
        {
          $set: {
            canonicalProductId: patch.canonicalProductId,
            match: patch.match,
            review,
            revision: expectedRevision + 1,
            updatedAt: patch.decidedAt,
          },
        },
        { new: true },
      ).lean<MarketplaceListingFields | null>();

      if (!updated) {
        const current = await MarketplaceListingModel.findOne({ id: listingId })
          .select({ revision: 1 })
          .lean<{ revision: number }>();
        return current
          ? { status: 'conflict', currentRevision: current.revision }
          : { status: 'not_found' };
      }

      return { status: 'applied', listing: toDomainListing(updated) };
    },

    async inspectMerge(productId: string): Promise<MergeInspection> {
      const [listings, variants] = await Promise.all([
        MarketplaceListingModel.countDocuments({ canonicalProductId: productId }),
        CanonicalProductModel.countDocuments({ variantOf: productId }),
      ]);
      return { listings, variants };
    },

    async claimMerge(options: {
      readonly sourceProductId: string;
      readonly targetProductId: string;
      readonly runId: string;
      readonly tx?: StoreSession;
    }): Promise<boolean> {
      const session = sessionOf(options.tx);

      // One conditional write decides ownership. `null` also matches documents that
      // predate the claim field, so no migration is needed.
      const result = await CanonicalProductModel.updateOne(
        {
          id: options.sourceProductId,
          $or: [
            { mergedInto: null, mergeRunId: null },
            { mergedInto: null, mergeRunId: options.runId },
            // Already archived into this exact target (by this run, or by a run
            // that won a race): re-applying the idempotent steps is harmless.
            { mergedInto: options.targetProductId },
          ],
        },
        { $set: { mergeRunId: options.runId } },
        session ? { session } : {},
      );

      return result.modifiedCount === 1 || result.matchedCount === 1;
    },

    async mergeProductReferences(options: {
      readonly sourceProductId: string;
      readonly targetProductId: string;
      readonly mergedAt: Date;
      readonly runId: string;
      readonly tx?: StoreSession;
    }): Promise<MergeReferenceCounts> {
      const session = sessionOf(options.tx);

      const listings = await MarketplaceListingModel.updateMany(
        { canonicalProductId: options.sourceProductId },
        { $set: { canonicalProductId: options.targetProductId } },
        session ? { session } : {},
      );

      const variants = await CanonicalProductModel.updateMany(
        { variantOf: options.sourceProductId },
        { $set: { variantOf: options.targetProductId } },
        session ? { session } : {},
      );

      // Archiving is conditional on the claim we took before the move. Re-applying
      // the same run after a crash matches the already-archived record, so recovery
      // stays idempotent; another run's claim can never archive the source.
      const archived = await CanonicalProductModel.updateOne(
        {
          id: options.sourceProductId,
          $or: [
            { mergedInto: null, mergeRunId: options.runId },
            { mergedInto: options.targetProductId },
          ],
        },
        {
          $set: {
            status: 'archived',
            mergedInto: options.targetProductId,
            mergedAt: options.mergedAt,
            updatedAt: options.mergedAt,
          },
        },
        session ? { session } : {},
      );

      if (archived.matchedCount !== 1) {
        throw new AppError({
          statusCode: 409,
          code: 'CONFLICT',
          message: `Merge run ${options.runId} no longer owns product ${options.sourceProductId}`,
        });
      }

      return { listings: listings.modifiedCount, variants: variants.modifiedCount };
    },

    async findCandidates(query: ProductCandidateQuery): Promise<CanonicalProduct[]> {
      const conditions: Record<string, unknown>[] = [];

      if (query.gtin) conditions.push({ gtin: query.gtin });
      if (query.mpn) conditions.push({ mpn: query.mpn });
      if (query.brandKey) conditions.push({ 'search.brandKey': query.brandKey });
      if (query.nameTokens && query.nameTokens.length > 0) {
        conditions.push({ 'search.tokens': { $in: [...query.nameTokens] } });
      }

      if (conditions.length === 0) return [];

      const filter: Record<string, unknown> = { $or: conditions };
      if (query.excludeIds && query.excludeIds.length > 0) {
        filter.id = { $nin: [...query.excludeIds] };
      }

      const documents = await CanonicalProductModel.find(filter)
        .sort({ id: 1 })
        .limit(query.limit)
        .lean<CanonicalProductFields[]>();

      return documents.map(toDomainProduct);
    },

    async searchCandidates(query: ProductSearchCandidates): Promise<CanonicalProduct[]> {
      const conditions: Record<string, unknown>[] = [{ status: query.status }];

      if (query.category) conditions.push({ category: query.category });
      if (query.brandKey) conditions.push({ 'search.brandKey': query.brandKey });
      if (query.tokens.length > 0) conditions.push({ 'search.tokens': { $in: [...query.tokens] } });

      const documents = await CanonicalProductModel.find({ $and: conditions })
        .sort({ id: 1 })
        .limit(query.limit)
        .lean<CanonicalProductFields[]>();

      return documents.map(toDomainProduct);
    },

    async countProducts(): Promise<number> {
      return CanonicalProductModel.countDocuments();
    },

    async upsertListings(records: readonly StoredListing[]): Promise<ListingWriteResult> {
      if (records.length === 0) return { created: 0, updated: 0, unchanged: 0 };

      const existing = await MarketplaceListingModel.find({
        id: { $in: records.map((record) => record.id) },
      })
        .select({ id: 1, contentHash: 1, review: 1 })
        .lean<
          {
            id: string;
            contentHash: string;
            review: { decision: string } | null;
          }[]
        >();
      const priorById = new Map(existing.map((document) => [document.id, document]));

      let created = 0;
      let updated = 0;
      let unchanged = 0;
      let respectedHumanDecisions = 0;

      const operations = records.map((listing) => {
        const prior = priorById.get(listing.id);
        const isNew = prior === undefined;
        const isUnchanged = prior?.contentHash === listing.contentHash;
        // A human decision outranks the matcher: ingestion refreshes the facts a
        // source can change, but never the resolution a person chose.
        const protectedDecision =
          prior?.review !== undefined &&
          prior?.review !== null &&
          prior.review.decision !== 'reopened';

        if (isNew) created += 1;
        else if (isUnchanged) unchanged += 1;
        else updated += 1;
        if (protectedDecision) respectedHumanDecisions += 1;

        // `lastObservedAt` advances even for unchanged content: seeing the same
        // listing again is still an observation, just not a new fact.
        const mutable = isUnchanged
          ? { lastObservedAt: new Date(listing.lastObservedAt) }
          : {
              ...(protectedDecision
                ? {}
                : { canonicalProductId: listing.canonicalProductId, match: listing.match }),
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
              contentHash: listing.contentHash,
              lastObservedAt: new Date(listing.lastObservedAt),
              updatedAt: new Date(listing.updatedAt),
            };

        return {
          updateOne: {
            filter: { id: listing.id },
            update: {
              $set: mutable,
              $setOnInsert: {
                id: listing.id,
                sourceId: listing.sourceId,
                marketplaceId: listing.marketplaceId,
                externalId: listing.externalId,
                provenance: listing.provenance,
                isSample: listing.isSample,
                revision: 0,
                createdAt: new Date(listing.createdAt),
              },
            },
            upsert: true,
          },
        };
      });

      await MarketplaceListingModel.bulkWrite(operations, { ordered: false });

      return {
        created,
        updated,
        unchanged,
        // Present only when it happened, so a report shape without human decisions
        // stays the same as it was before Sprint 6.
        ...(respectedHumanDecisions > 0 ? { respectedHumanDecisions } : {}),
      };
    },

    async listListings(productId: string, limit: number): Promise<StoredListing[]> {
      const documents = await MarketplaceListingModel.find({ canonicalProductId: productId })
        .sort({ marketplaceId: 1, sourceId: 1 })
        .limit(limit)
        .lean<MarketplaceListingFields[]>();

      return documents.map(toDomainListing);
    },

    async countListings(): Promise<number> {
      return MarketplaceListingModel.countDocuments();
    },

    async countUnresolvedListings(): Promise<number> {
      return MarketplaceListingModel.countDocuments({ canonicalProductId: null });
    },
  };
}
