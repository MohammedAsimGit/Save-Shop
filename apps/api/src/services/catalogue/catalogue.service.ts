import {
  MAX_LISTINGS_PER_PRODUCT,
  marketplaceListingSchema,
  normalizeGtin,
  normalizeKey,
  normalizeMpn,
  normalizeText,
  tokenizeText,
  type CanonicalProduct,
  type CatalogueProductResponse,
  type CatalogueSearchQuery,
  type CatalogueSearchResponse,
  type ListingSummary,
  type MatchStatus,
  type ProductListingsResponse,
} from '@smart-shopping/shared';

import { AppError } from '../../utils/AppError.js';
import type { CatalogueStore, StoredListing } from './catalogueStore.js';
import type { IdentityMatcher } from './matching.service.js';

/**
 * Catalogue reads.
 *
 * Search is deterministic and explainable: candidate selection uses indexed keys,
 * ordering uses the documented score below, and pagination is applied after
 * ordering so a page is never a slice of an unordered set.
 *
 * The catalogue returns *products*. Marketplace listings are exposed separately
 * (`getListings`) and never decide what a product is.
 */

/** Upper bound on candidates scored per query; keeps a pathological catalogue bounded. */
const MAX_SEARCH_CANDIDATES = 500;

/**
 * Relevance score. Deterministic, additive, and documented in docs/API_CONTRACTS.md:
 *
 *   exact product id / GTIN / MPN      1000 / 900 / 850
 *   exact brand query                   400
 *   model number inside the query       350
 *   full name substring                 120
 *   query token present in the name     60 per token
 *   query token is a name prefix        35 per token
 */
export function relevanceScore(product: CanonicalProduct, rawQuery: string): number {
  const query = rawQuery.trim();
  if (query === '') return 0;

  const normalizedQuery = normalizeText(query);
  let score = 0;

  if (product.id === normalizedQuery.replace(/\s+/g, '-')) score += 1000;

  const gtin = normalizeGtin(query);
  if (gtin && product.gtin === gtin) score += 900;

  if (product.mpn && normalizeMpn(query) === product.mpn) score += 850;

  const brandKey = normalizeKey(product.brand);
  if (normalizeKey(query) === brandKey) score += 400;

  const modelKey = product.model ? normalizeKey(product.model) : null;
  if (modelKey && normalizeKey(query).includes(modelKey)) score += 350;

  const nameText = normalizeText(product.name);
  if (nameText.includes(normalizedQuery)) score += 120;

  const nameTokens = tokenizeText(product.name);
  for (const token of tokenizeText(query)) {
    if (nameTokens.includes(token)) score += 60;
    else if (nameTokens.some((nameToken) => nameToken.startsWith(token))) score += 35;
  }

  return score;
}

function summariseListings(listings: readonly StoredListing[]): ListingSummary {
  const byStatus: Record<MatchStatus, number> = {
    exact: 0,
    strong: 0,
    possible: 0,
    unmatched: 0,
    conflict: 0,
  };

  let resolved = 0;
  let requiresReview = 0;

  for (const listing of listings) {
    byStatus[listing.match.status] += 1;
    if (listing.canonicalProductId) resolved += 1;
    if (listing.match.requiresReview) requiresReview += 1;
  }

  return {
    total: listings.length,
    resolved,
    unresolved: listings.length - resolved,
    requiresReview,
    byStatus,
  };
}

export interface CatalogueService {
  search(query: CatalogueSearchQuery): Promise<CatalogueSearchResponse>;
  getProduct(productId: string): Promise<CatalogueProductResponse>;
  getListings(productId: string): Promise<ProductListingsResponse>;
  /** Canonical identity for other services; `null` when the product is unknown. */
  resolveProduct(productId: string): Promise<CanonicalProduct | null>;
  readonly store: CatalogueStore;
}

export interface CatalogueServiceOptions {
  readonly store: CatalogueStore;
  /** Reserved for identity lookups; reads never match on the fly. */
  readonly matcher?: IdentityMatcher;
}

export function createCatalogueService(options: CatalogueServiceOptions): CatalogueService {
  const { store } = options;

  /**
   * Follows merge redirects to the surviving product.
   *
   * A merged product is archived, never deleted, so an old link, bookmark or price
   * alert keeps working. The hop limit means a corrupted chain cannot loop forever.
   */
  async function followMerge(
    product: CanonicalProduct,
  ): Promise<{ product: CanonicalProduct; redirectedFrom: string | null }> {
    let current = product;
    let redirectedFrom: string | null = null;

    for (let hop = 0; hop < 5 && current.mergedInto; hop += 1) {
      const next = await store.findProduct(current.mergedInto);
      if (!next) break;
      redirectedFrom ??= current.id;
      current = next;
    }

    return { product: current, redirectedFrom };
  }

  async function requireProduct(
    productId: string,
  ): Promise<{ product: CanonicalProduct; redirectedFrom: string | null }> {
    const product = await store.findProduct(productId);
    if (!product) throw AppError.notFound(`Unknown product: ${productId}`);
    return followMerge(product);
  }

  return {
    store,

    async resolveProduct(productId: string): Promise<CanonicalProduct | null> {
      const product = await store.findProduct(productId);
      return product ? (await followMerge(product)).product : null;
    },

    async search(query: CatalogueSearchQuery): Promise<CatalogueSearchResponse> {
      const rawQuery = query.q?.trim() ?? '';
      const brandKey = query.brand ? normalizeKey(query.brand) : undefined;

      const candidates = await store.searchCandidates({
        query,
        ...(brandKey ? { brandKey } : {}),
        ...(query.category ? { category: query.category } : {}),
        status: query.status,
        tokens: tokenizeText(rawQuery).slice(0, 6),
        limit: MAX_SEARCH_CANDIDATES,
      });

      const scored = candidates.map((product) => ({
        product,
        score: relevanceScore(product, rawQuery),
      }));

      const matched = rawQuery === '' ? scored : scored.filter((entry) => entry.score > 0);

      matched.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (a.product.name !== b.product.name) return a.product.name.localeCompare(b.product.name);
        return a.product.id.localeCompare(b.product.id);
      });

      const totalItems = matched.length;
      const start = (query.page - 1) * query.pageSize;
      const products = matched.slice(start, start + query.pageSize).map((entry) => entry.product);

      const notices: string[] = [];

      if (rawQuery !== '' && totalItems === 0) {
        notices.push(`No canonical product matched "${rawQuery}".`);
      }

      if (rawQuery !== '') {
        notices.push(
          'Matches are against canonical product identity (name, brand, model and identifiers), not marketplace titles.',
        );
      }

      if (totalItems > MAX_SEARCH_CANDIDATES) {
        notices.push(
          `Only the first ${MAX_SEARCH_CANDIDATES} canonical products were considered for this query.`,
        );
      }

      const samples = products.filter((product) => product.isSample).length;
      if (products.length > 0 && samples === products.length) {
        notices.push(
          'Every result is a sample catalogue record; no verified marketplace catalogue feed is connected.',
        );
      } else if (samples > 0) {
        notices.push(
          `${samples} result${samples === 1 ? ' is a' : 's are'} sample catalogue record(s).`,
        );
      }

      if (start >= totalItems && totalItems > 0) {
        notices.push(`Page ${query.page} is past the last page; returning an empty page.`);
      }

      return {
        query: {
          q: query.q ?? null,
          brand: query.brand ?? null,
          category: query.category ?? null,
          model: query.model ?? null,
        },
        products,
        page: query.page,
        pageSize: query.pageSize,
        totalItems,
        ordering: 'relevance',
        notices,
      };
    },

    async getProduct(productId: string): Promise<CatalogueProductResponse> {
      const { product, redirectedFrom } = await requireProduct(productId);
      const listings = await store.listListings(product.id, MAX_LISTINGS_PER_PRODUCT);
      const summary = summariseListings(listings);

      const notices: string[] = [];
      if (redirectedFrom) {
        notices.push(
          `Product ${redirectedFrom} was merged into ${product.id}; showing the surviving catalogue record.`,
        );
      }
      if (product.isSample) {
        notices.push(
          'This is a sample catalogue record: the product identity is demo data, not a verified marketplace catalogue entry.',
        );
      }

      if (summary.unresolved > 0) {
        notices.push(
          `${summary.unresolved} listing(s) could not be resolved to this product and are excluded from comparison.`,
        );
      }

      if (summary.requiresReview > 0) {
        notices.push(
          `${summary.requiresReview} listing match(es) require human review before they can be used.`,
        );
      }

      const unresolvedElsewhere = await store.countUnresolvedListings();
      if (unresolvedElsewhere > 0) {
        notices.push(
          `${unresolvedElsewhere} listing(s) in the catalogue are still unresolved and await review.`,
        );
      }

      return { product, listingSummary: summary, notices };
    },

    async getListings(productId: string): Promise<ProductListingsResponse> {
      const { product, redirectedFrom } = await requireProduct(productId);
      const stored = await store.listListings(product.id, MAX_LISTINGS_PER_PRODUCT);

      // Parsing strips storage-only fields (the change hash) and guarantees the
      // response matches the shared contract.
      const listings = stored.map((listing) => marketplaceListingSchema.parse(listing));
      const summary = summariseListings(stored);

      const notices: string[] = [];
      if (redirectedFrom) {
        notices.push(
          `Product ${redirectedFrom} was merged into ${product.id}; these are the surviving record's listings.`,
        );
      }
      if (stored.length === MAX_LISTINGS_PER_PRODUCT) {
        notices.push(`Only the first ${MAX_LISTINGS_PER_PRODUCT} listings are shown.`);
      }
      notices.push(
        "A listing is one marketplace's item. Only exact and strong matches are resolved; possible and conflicting matches stay unresolved until reviewed.",
      );

      return {
        productId: product.id,
        listings,
        listingSummary: summary,
        notices,
      };
    },
  };
}
