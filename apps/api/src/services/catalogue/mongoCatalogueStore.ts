import type { CanonicalProduct, MarketplaceListing } from '@smart-shopping/shared';

import {
  CanonicalProductModel,
  type CanonicalProductFields,
} from '../../models/canonicalProduct.js';
import {
  MarketplaceListingModel,
  type MarketplaceListingFields,
} from '../../models/marketplaceListing.js';
import {
  buildSearchFields,
  type CatalogueStore,
  type ListingWriteResult,
  type ProductCandidateQuery,
  type ProductSearchCandidates,
  type ProductWriteResult,
  type StoredListing,
} from './catalogueStore.js';

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
        .select({ id: 1, contentHash: 1 })
        .lean<{ id: string; contentHash: string }[]>();
      const priorHash = new Map(existing.map((document) => [document.id, document.contentHash]));

      let created = 0;
      let updated = 0;
      let unchanged = 0;

      const operations = records.map((listing) => {
        const prior = priorHash.get(listing.id);
        const isNew = prior === undefined;
        const isUnchanged = prior === listing.contentHash;

        if (isNew) created += 1;
        else if (isUnchanged) unchanged += 1;
        else updated += 1;

        // `lastObservedAt` advances even for unchanged content: seeing the same
        // listing again is still an observation, just not a new fact.
        const mutable = isUnchanged
          ? { lastObservedAt: new Date(listing.lastObservedAt) }
          : {
              canonicalProductId: listing.canonicalProductId,
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
              match: listing.match,
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
                createdAt: new Date(listing.createdAt),
              },
            },
            upsert: true,
          },
        };
      });

      await MarketplaceListingModel.bulkWrite(operations, { ordered: false });

      return { created, updated, unchanged };
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
