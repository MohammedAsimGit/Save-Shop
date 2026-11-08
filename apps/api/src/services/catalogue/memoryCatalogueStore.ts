import { normalizeKey, type CanonicalProduct } from '@smart-shopping/shared';

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

      for (const record of records) {
        const prior = listings.get(record.id);
        if (!prior) {
          listings.set(record.id, record);
          created += 1;
          continue;
        }
        if (prior.contentHash === record.contentHash) {
          unchanged += 1;
          continue;
        }
        listings.set(record.id, record);
        updated += 1;
      }

      return { created, updated, unchanged };
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
