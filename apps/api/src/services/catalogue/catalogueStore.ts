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
  type MarketplaceListing,
} from '@smart-shopping/shared';

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
