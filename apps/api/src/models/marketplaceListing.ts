import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

/**
 * Marketplace listings (Sprint 5).
 *
 * One document = one item as a source reported it, on one marketplace. A listing
 * never becomes a canonical product on its own: it carries a `match` verdict and
 * may only resolve to an existing canonical `id`.
 *
 * Deduplication is enforced by the database, not by the ingestion loop: the unique
 * `(sourceId, marketplaceId, externalId)` index is what makes repeated ingestion
 * idempotent even if two runs overlap.
 *
 * `contentHash` covers the fields a source can change; when it is unchanged the
 * ingestion report counts the record as `unchanged` instead of `updated`.
 */

const listingMatchSchema = new Schema(
  {
    status: {
      type: String,
      required: true,
      enum: ['exact', 'strong', 'possible', 'unmatched', 'conflict'],
    },
    method: {
      type: String,
      required: true,
      enum: [
        'canonical_id',
        'gtin',
        'mpn',
        'brand_model',
        'brand_model_specs',
        'title_similarity',
        'none',
      ],
    },
    confidence: { type: Number, required: true, min: 0, max: 100 },
    requiresReview: { type: Boolean, required: true },
    reasons: { type: [String], default: [] },
  },
  { _id: false },
);

const marketplaceListingSchema = new Schema(
  {
    /** sha256 of source|marketplace|externalId; deterministic and review friendly. */
    id: { type: String, required: true, maxLength: 120 },
    canonicalProductId: { type: String, default: null, maxLength: 120 },
    sourceId: { type: String, required: true, maxLength: 80 },
    marketplaceId: { type: String, required: true, maxLength: 80 },
    externalId: { type: String, required: true, maxLength: 200 },
    title: { type: String, required: true, maxLength: 300 },
    url: { type: String, required: true, maxLength: 2000 },
    brand: { type: String, maxLength: 80 },
    model: { type: String, maxLength: 80 },
    mpn: { type: String, maxLength: 40 },
    gtin: { type: String, match: /^\d{14}$/ },
    specifications: { type: Schema.Types.Mixed, default: {} },
    imageUrl: { type: String, maxLength: 2000 },
    color: { type: String, maxLength: 40 },
    storageCapacity: { type: String, maxLength: 20 },
    provenance: { type: String, required: true, enum: ['demo', 'manual', 'authorized_source'] },
    isSample: { type: Boolean, required: true },
    match: { type: listingMatchSchema, required: true },
    lastObservedAt: { type: Date, required: true },
    /** Hash of the mutable content, so a no-op re-ingestion is reported as such. */
    contentHash: { type: String, required: true },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
  },
  { collection: 'marketplace_listings', versionKey: false, timestamps: false },
);

// The dedupe key: one row per item, per source, per marketplace.
marketplaceListingSchema.index({ sourceId: 1, marketplaceId: 1, externalId: 1 }, { unique: true });
marketplaceListingSchema.index({ canonicalProductId: 1 });
marketplaceListingSchema.index({ 'match.status': 1 });
marketplaceListingSchema.index({ gtin: 1 });

export type MarketplaceListingFields = InferSchemaType<typeof marketplaceListingSchema>;

export const MarketplaceListingModel: Model<MarketplaceListingFields> =
  (mongoose.models['MarketplaceListing'] as Model<MarketplaceListingFields> | undefined) ??
  mongoose.model<MarketplaceListingFields>('MarketplaceListing', marketplaceListingSchema);
