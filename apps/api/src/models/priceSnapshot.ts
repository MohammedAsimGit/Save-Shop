import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

/**
 * Price snapshot persistence (Sprint 3).
 *
 * One document = one observation a source actually reported. Documents are
 * append-only: a later observation is a new row, never an update of an old one,
 * because history that can be rewritten is not history.
 *
 * Two deliberate choices:
 *
 * 1. **No TTL index on this collection.** The retention policy is a documented
 *    job, not "Mongo quietly deletes your price history after an hour". The
 *    `expiresAt` index serves freshness queries only.
 * 2. **`observationKey` unique index.** Replaying the same provider response must
 *    be idempotent, so the key hashes the identity of the observation (source,
 *    marketplace, product, price, availability, capture time) and a second write
 *    is a no-op rather than a duplicate point on a chart.
 */

const moneySchema = new Schema(
  {
    amountMinor: { type: Number, required: true, min: 1 },
    currency: { type: String, required: true, match: /^[A-Z]{3}$/ },
  },
  { _id: false },
);

const attributionSchema = new Schema(
  {
    label: { type: String, required: true, maxLength: 160 },
    url: { type: String },
  },
  { _id: false },
);

const priceSnapshotSchema = new Schema(
  {
    /** sha256 of the observation identity; see `observationKey()` in the store. */
    observationKey: { type: String, required: true },
    productId: { type: String, required: true, maxLength: 120 },
    marketplaceId: { type: String, required: true, maxLength: 80 },
    sourceId: { type: String, required: true, maxLength: 80 },
    productUrl: { type: String, required: true },
    price: { type: moneySchema, required: true },
    availability: {
      type: String,
      required: true,
      enum: ['in_stock', 'out_of_stock', 'preorder', 'unknown'],
    },
    /** When the source observed the price. */
    capturedAt: { type: Date, required: true },
    ttlSeconds: { type: Number, required: true, min: 30, max: 604_800 },
    /** Derived from capturedAt + ttlSeconds; indexed for freshness queries. */
    expiresAt: { type: Date, required: true },
    attribution: { type: attributionSchema, required: true },
    /** Copied from the source at ingest time, so provenance survives source edits. */
    sourceVerification: { type: String, required: true, enum: ['verified', 'sample'] },
    isSample: { type: Boolean, required: true },
    /** When this API stored the observation (distinct from capturedAt). */
    ingestedAt: { type: Date, required: true },
  },
  { collection: 'price_snapshots', versionKey: false, timestamps: false },
);

// Idempotent ingestion: one document per distinct observation.
priceSnapshotSchema.index({ observationKey: 1 }, { unique: true });

// History window for one product (`GET /products/:id/history`).
priceSnapshotSchema.index({ productId: 1, capturedAt: 1 });

// Source- and marketplace-filtered history, same product-scoped window.
priceSnapshotSchema.index({ productId: 1, sourceId: 1, capturedAt: 1 });
priceSnapshotSchema.index({ productId: 1, marketplaceId: 1, capturedAt: 1 });

// Cross-product source diagnostics and future retention/compaction jobs.
priceSnapshotSchema.index({ sourceId: 1, capturedAt: 1 });
priceSnapshotSchema.index({ expiresAt: 1 });

export type PriceSnapshotFields = InferSchemaType<typeof priceSnapshotSchema>;

/** Reused across hot reloads so Mongoose never throws OverwriteModelError. */
export const PriceSnapshotModel: Model<PriceSnapshotFields> =
  (mongoose.models['PriceSnapshot'] as Model<PriceSnapshotFields> | undefined) ??
  mongoose.model<PriceSnapshotFields>('PriceSnapshot', priceSnapshotSchema);
