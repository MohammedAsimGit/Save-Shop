import { z } from 'zod';

/**
 * Price comparison contract.
 *
 * Everything here is transport-level: validated at the API boundary, parsed again
 * in the clients, and consumed by the comparison engine in `comparison/engine.ts`.
 *
 * Two rules are encoded in the types rather than left to callers:
 * 1. A price snapshot always carries where it came from, when it was observed and
 *    how long it stays valid. A price without provenance does not parse.
 * 2. "Verified" is a property of the *source*, never of the number. Sample data
 *    can be ranked and displayed, but it can never be reported as verified.
 */

/** How a source obtained its prices. Mirrors `MarketSource` plus a demo kind. */
export const marketSourceKindSchema = z.enum([
  'demo',
  'marketplace_api',
  'affiliate_feed',
  'licensed_feed',
  'manual_entry',
]);

export type MarketSourceKind = z.infer<typeof marketSourceKindSchema>;

/**
 * `sample` = invented data for interface work. `verified` = observed through an
 * authorised channel. Nothing in between is allowed, so no UI can imply a
 * stronger guarantee than the source actually provides.
 */
export const sourceVerificationSchema = z.enum(['verified', 'sample']);

/** Permission state, mirroring the ingestion feasibility findings. */
export const sourcePermissionStatusSchema = z.enum(['granted', 'pending', 'not_requested']);

const isoDateTime = z.string().refine((value) => {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value) && !Number.isNaN(Date.parse(value));
}, 'must be an ISO 8601 date-time');

const httpUrl = z
  .string()
  .refine((value) => /^https?:\/\/[^\s]+$/i.test(value), 'must be an http(s) URL');

const currencyCode = z.string().regex(/^[A-Z]{3}$/, 'must be an ISO 4217 alphabetic currency code');

export const moneySchema = z.object({
  /** Integer minor units (paise/cents). Floats are rejected, not rounded. */
  amountMinor: z.number().int().positive(),
  currency: currencyCode,
});

/**
 * Identity and legal posture of a price source.
 *
 * `enabled` is independent of `permission`: a source can be implemented and still
 * switched off because no written permission exists (see docs/INGESTION_FEASIBILITY.md).
 */
export const marketSourceSchema = z.object({
  id: z.string().min(1).max(80),
  displayName: z.string().min(1).max(120),
  kind: marketSourceKindSchema,
  verification: sourceVerificationSchema,
  attribution: z.object({
    label: z.string().min(1).max(160),
    url: httpUrl.optional(),
  }),
  permission: z.object({
    status: sourcePermissionStatusSchema,
    note: z.string().max(400).optional(),
    /** Alerts are a separate permission question; default is "not permitted". */
    permitsPriceAlerts: z.boolean(),
  }),
  coverage: z.object({
    countries: z.array(z.string().length(2)).min(1),
    /** Marketplace ids this source is allowed to return prices for. */
    marketplaces: z.array(z.string().min(1)).min(1),
  }),
  enabled: z.boolean(),
  /** Present when `enabled` is false, so coverage is never a mystery. */
  disabledReason: z.string().max(400).optional(),
});

export type MarketSource = z.infer<typeof marketSourceSchema>;

export const offerAvailabilitySchema = z.enum(['in_stock', 'out_of_stock', 'preorder', 'unknown']);

export type OfferAvailability = z.infer<typeof offerAvailabilitySchema>;

/**
 * One observation of one marketplace's offer for one product.
 *
 * TTL is carried by the snapshot rather than configured per endpoint, because a
 * licensed feed and an affiliate API have different freshness limits.
 */
export const offerSnapshotSchema = z.object({
  productId: z.string().min(1).max(120),
  marketplaceId: z.string().min(1).max(80),
  sourceId: z.string().min(1).max(80),
  productUrl: httpUrl,
  price: moneySchema,
  availability: offerAvailabilitySchema,
  /** When the price was observed, not when it was fetched. */
  capturedAt: isoDateTime,
  /** How long this observation may be presented as current. */
  ttlSeconds: z.number().int().min(30).max(604_800),
  attribution: z.object({
    label: z.string().min(1).max(160),
    url: httpUrl.optional(),
  }),
});

export type OfferSnapshot = z.infer<typeof offerSnapshotSchema>;

/**
 * Why an offer was left out of the ranking. Every exclusion has a reason, so the
 * UI can explain coverage instead of silently showing fewer offers.
 */
export const exclusionReasonSchema = z.enum([
  'invalid',
  'unknown_source',
  'stale',
  'unavailable',
  'currency_mismatch',
  'future_timestamp',
]);

export type ExclusionReason = z.infer<typeof exclusionReasonSchema>;

export const freshnessSchema = z.enum(['fresh', 'stale']);
export type Freshness = z.infer<typeof freshnessSchema>;

/** A snapshot joined with its source, ready to render. */
export const comparedOfferSchema = offerSnapshotSchema.extend({
  source: marketSourceSchema,
  freshness: freshnessSchema,
  /** Cheap among the eligible, same-currency offers. Not necessarily verified. */
  isLowest: z.boolean(),
  /** True only when the source is authorised to state prices as verified. */
  isVerified: z.boolean(),
});

export type ComparedOffer = z.infer<typeof comparedOfferSchema>;

export const excludedOfferSchema = z.object({
  reason: exclusionReasonSchema,
  detail: z.string().max(240).optional(),
  /** The raw snapshot as received, or `null` when it did not parse at all. */
  snapshot: z.unknown(),
});

export type ExcludedOffer = z.infer<typeof excludedOfferSchema>;

/**
 * `verified` - at least one eligible offer came from a verified source.
 * `sample_only` - only sample data was eligible; it must be labelled as such.
 * `no_offers` - nothing usable this time.
 */
export const comparisonStatusSchema = z.enum(['verified', 'sample_only', 'no_offers']);

export const comparisonResultSchema = z.object({
  productId: z.string().min(1),
  /** The currency the comparison was ranked in. */
  currency: currencyCode,
  generatedAt: isoDateTime,
  /** Cheapest eligible offer, verified or not. */
  lowest: comparedOfferSchema.nullable(),
  /** Cheapest eligible offer from a source permitted to verify prices. */
  lowestVerified: comparedOfferSchema.nullable(),
  /** Eligible offers, cheapest first. */
  offers: z.array(comparedOfferSchema),
  excluded: z.array(excludedOfferSchema),
  status: comparisonStatusSchema,
  /** The sources that were consulted, including disabled ones. */
  sources: z.array(marketSourceSchema),
  notices: z.array(z.string().max(300)),
});

export type ComparisonResult = z.infer<typeof comparisonResultSchema>;

export const comparedProductSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  brand: z.string().min(1).optional(),
  /** Where the product identity came from; offers come from the adapters. */
  catalog: z.string().min(1),
});

/** GET {API_PREFIX}/products/:productId/comparison */
export const productComparisonResponseSchema = comparisonResultSchema.extend({
  product: comparedProductSchema,
});

export type ProductComparisonResponse = z.infer<typeof productComparisonResponseSchema>;

/** GET {API_PREFIX}/sources */
export const sourceCoverageResponseSchema = z.object({
  generatedAt: isoDateTime,
  sources: z.array(marketSourceSchema),
  /** Human-readable summary of what is and is not covered today. */
  notices: z.array(z.string().max(300)),
});

export type SourceCoverageResponse = z.infer<typeof sourceCoverageResponseSchema>;
