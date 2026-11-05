import type { Money } from './money.js';

/**
 * Domain types for the product catalog.
 *
 * Sprint 0 defines the SHAPE of these values only. No persistence models,
 * marketplace identifiers or price data exist yet.
 */

/** A sellable product concept, independent of any marketplace. */
export interface Product {
  readonly id: string;
  readonly title: string;
  readonly brand?: string;
  readonly category?: string;
  readonly description?: string;
  readonly imageUrls: readonly string[];
  /** Global/industry identifiers used later for cross-marketplace matching. */
  readonly identifiers: ProductIdentifiers;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * Identifiers that are owned by standards bodies or manufacturers.
 * Marketplace-internal ids do NOT belong here - they belong to a listing.
 */
export interface ProductIdentifiers {
  /** Global Trade Item Number (EAN/UPC/GTIN-13/GTIN-14), normalised. */
  readonly gtin?: string;
  /** Manufacturer part number. */
  readonly mpn?: string;
}

/** A concrete purchasable variation of a Product (size, colour, capacity). */
export interface ProductVariant {
  readonly id: string;
  readonly productId: string;
  readonly title: string;
  readonly attributes: Readonly<Record<string, string>>;
  readonly identifiers: ProductIdentifiers;
}

/** A marketplace (external e-commerce provider) known to the platform. */
export interface Marketplace {
  readonly id: string;
  /** Stable internal slug, e.g. "example-marketplace". Never a guessed vendor id. */
  readonly slug: string;
  readonly displayName: string;
  readonly isActive: boolean;
}

/**
 * A product offered on a specific marketplace.
 * This is the level at which prices and seller information live.
 */
export interface ProductListing {
  readonly id: string;
  readonly productId: string;
  readonly variantId?: string;
  readonly marketplaceId: string;
  /** The marketplace's own identifier for this item. Populated by an authorised integration. */
  readonly externalId: string;
  /** Canonical URL on the marketplace, used for redirects and affiliate links. */
  readonly url: string;
  readonly sellerName?: string;
  readonly availability: ListingAvailability;
  readonly lastCheckedAt?: string;
}

export type ListingAvailability = 'unknown' | 'in_stock' | 'out_of_stock' | 'preorder';

/** An immutable observation of a listing's price at a point in time. */
export interface PriceSnapshot {
  readonly id: string;
  readonly listingId: string;
  readonly price: Money;
  readonly availability: ListingAvailability;
  /** ISO 8601 timestamp of when the price was observed. */
  readonly capturedAt: string;
  /** How the observation was obtained, so unverified data is never presented as verified. */
  readonly source: PriceSource;
}

export type PriceSource = 'marketplace_api' | 'affiliate_feed' | 'manual_entry';
