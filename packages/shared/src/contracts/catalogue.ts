import { z } from 'zod';

import { isValidGtin } from '../catalogue/normalize.js';
import { httpUrlSchema, isoDateTimeSchema } from './comparison.js';

/**
 * Canonical catalogue contracts (Sprint 5).
 *
 * The catalogue - not a marketplace - owns product identity. A canonical product
 * describes *what a thing is*; a `MarketplaceListing` describes *where it was
 * seen* and how confident we are that the two are the same thing. Keeping them
 * separate is what stops a marketplace title from silently becoming a product.
 *
 * Identifiers are optional because we only store ones we actually received. An
 * empty `mpn`/`gtin` is information ("not known yet"); a generated one would be
 * fabrication.
 */

export const catalogueStatusSchema = z.enum(['active', 'draft', 'archived']);
export type CatalogueStatus = z.infer<typeof catalogueStatusSchema>;

/** Where a canonical record came from. `demo` can never be reported as verified. */
export const catalogueProvenanceSchema = z.enum(['demo', 'manual', 'authorized_source']);
export type CatalogueProvenance = z.infer<typeof catalogueProvenanceSchema>;

export const catalogueCategorySchema = z
  .string()
  .regex(/^[a-z][a-z0-9-]{0,39}$/, 'must be a lowercase category slug');

export const catalogueProductIdSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9][a-z0-9-]*$/, 'must be a lowercase slug');

/**
 * GTIN-8/12/13/14 with a valid GS1 check digit. Invalid check digits are rejected
 * rather than repaired: a wrong identifier is worse than a missing one.
 */
export const gtinSchema = z
  .string()
  .refine((value) => isValidGtin(value), 'must be a GTIN-8/12/13/14 with a valid check digit');

export const mpnSchema = z
  .string()
  .regex(/^[A-Z0-9][A-Z0-9._-]{1,39}$/, 'must be an uppercase manufacturer part number');

export const modelSchema = z
  .string()
  .regex(/^[A-Z0-9][A-Z0-9._-]{0,39}$/, 'must be an uppercase model number');

export const specificationsSchema = z.record(z.string().min(1).max(40), z.string().min(1).max(160));

export const variantAttributesSchema = z.record(
  z.string().min(1).max(30),
  z.string().min(1).max(40),
);

/** The authoritative description of one product, independent of any marketplace. */
export const canonicalProductSchema = z.object({
  /** Stable catalogue slug. This is the id prices and history reference. */
  id: catalogueProductIdSchema,
  name: z.string().min(2).max(200),
  brand: z.string().min(1).max(80),
  category: catalogueCategorySchema,
  /** Manufacturer-issued identifiers, stored only when actually supplied. */
  model: modelSchema.optional(),
  mpn: mpnSchema.optional(),
  gtin: gtinSchema.optional(),
  description: z.string().min(1).max(2000).optional(),
  specifications: specificationsSchema.default({}),
  color: z.string().min(1).max(40).optional(),
  storageCapacity: z.string().min(1).max(20).optional(),
  /** Base product this record varies, so variants stay distinct but connected. */
  variantOf: catalogueProductIdSchema.nullable().default(null),
  variantAttributes: variantAttributesSchema.default({}),
  imageUrls: z.array(httpUrlSchema).max(8).default([]),
  status: catalogueStatusSchema,
  provenance: catalogueProvenanceSchema,
  /** True for records that came from the sample catalogue; never "verified". */
  isSample: z.boolean(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type CanonicalProduct = z.infer<typeof canonicalProductSchema>;

/**
 * How a listing was matched to a canonical product.
 *
 * - `exact`   - an identifier that cannot collide (GTIN, or a canonical id supplied
 *               by the source itself) matched one product;
 * - `strong`  - MPN, or brand + model (+ variant attributes) matched one product;
 * - `possible`- only weak evidence (title similarity / shared brand) matched, or two
 *               products matched equally well. Always unresolved, pending review;
 * - `unmatched` - nothing plausible;
 * - `conflict` - identifiers pointed at plots that cannot be the same product
 *               (different GTIN/MPN/generation, accessory, variant mismatch).
 */
export const matchStatusSchema = z.enum(['exact', 'strong', 'possible', 'unmatched', 'conflict']);
export type MatchStatus = z.infer<typeof matchStatusSchema>;

export const matchMethodSchema = z.enum([
  'canonical_id',
  'gtin',
  'mpn',
  'brand_model',
  'brand_model_specs',
  'title_similarity',
  'none',
]);
export type MatchMethod = z.infer<typeof matchMethodSchema>;

/**
 * `confidence` is a deterministic match-strength score from 0 to 100 produced by
 * documented rules. It is **not** a probability and no UI may present it as one.
 */
export const listingMatchSchema = z.object({
  status: matchStatusSchema,
  method: matchMethodSchema,
  confidence: z.number().int().min(0).max(100),
  /** `possible` and `conflict` are never auto-resolved, so they need review. */
  requiresReview: z.boolean(),
  reasons: z.array(z.string().min(1).max(160)).max(6).default([]),
});

export type ListingMatch = z.infer<typeof listingMatchSchema>;

/** What one marketplace says about one item. Never the product itself. */
export const marketplaceListingSchema = z.object({
  /** Deterministic key: hash of source + marketplace + the source's own id. */
  id: z.string().min(1).max(120),
  /** Only set for `exact`/`strong` matches; ambiguous listings stay unresolved. */
  canonicalProductId: catalogueProductIdSchema.nullable(),
  sourceId: z.string().min(1).max(80),
  marketplaceId: z.string().min(1).max(80),
  /** The marketplace's own identifier for the item, as supplied by the source. */
  externalId: z.string().min(1).max(200),
  /** The source's title, preserved verbatim for audit and review. */
  title: z.string().min(1).max(300),
  url: httpUrlSchema,
  brand: z.string().min(1).max(80).optional(),
  model: z.string().min(1).max(80).optional(),
  mpn: z.string().min(1).max(40).optional(),
  gtin: gtinSchema.optional(),
  specifications: specificationsSchema.default({}),
  imageUrl: httpUrlSchema.optional(),
  color: z.string().min(1).max(40).optional(),
  storageCapacity: z.string().min(1).max(20).optional(),
  provenance: catalogueProvenanceSchema,
  isSample: z.boolean(),
  match: listingMatchSchema,
  lastObservedAt: isoDateTimeSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type MarketplaceListing = z.infer<typeof marketplaceListingSchema>;

export const listingSummarySchema = z.object({
  total: z.number().int().min(0),
  resolved: z.number().int().min(0),
  unresolved: z.number().int().min(0),
  requiresReview: z.number().int().min(0),
  byStatus: z.record(matchStatusSchema, z.number().int().min(0)),
});

export type ListingSummary = z.infer<typeof listingSummarySchema>;

/** GET {API_PREFIX}/products */
export const catalogueSearchQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  brand: z.string().trim().max(80).optional(),
  category: catalogueCategorySchema.optional(),
  model: z.string().trim().max(40).optional(),
  status: catalogueStatusSchema.default('active'),
  page: z.coerce.number().int().min(1).max(500).default(1),
  pageSize: z.coerce.number().int().min(1).max(48).default(12),
});

export type CatalogueSearchQuery = z.infer<typeof catalogueSearchQuerySchema>;

export const catalogueSearchResponseSchema = z.object({
  query: z.object({
    q: z.string().nullable(),
    brand: z.string().nullable(),
    category: z.string().nullable(),
    model: z.string().nullable(),
  }),
  products: z.array(canonicalProductSchema),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  totalItems: z.number().int().min(0),
  /** Relevance is deterministic and documented; this explains what was applied. */
  ordering: z.literal('relevance'),
  notices: z.array(z.string().max(300)),
});

export type CatalogueSearchResponse = z.infer<typeof catalogueSearchResponseSchema>;

/** GET {API_PREFIX}/products/:productId */
export const catalogueProductResponseSchema = z.object({
  product: canonicalProductSchema,
  listingSummary: listingSummarySchema,
  notices: z.array(z.string().max(300)),
});

export type CatalogueProductResponse = z.infer<typeof catalogueProductResponseSchema>;

/** GET {API_PREFIX}/products/:productId/listings */
export const productListingsResponseSchema = z.object({
  productId: catalogueProductIdSchema,
  listings: z.array(marketplaceListingSchema),
  listingSummary: listingSummarySchema,
  notices: z.array(z.string().max(300)),
});

export type ProductListingsResponse = z.infer<typeof productListingsResponseSchema>;

/** Where a listing's match was decided, so review has the full picture. */
export const MAX_LISTINGS_PER_PRODUCT = 50;
