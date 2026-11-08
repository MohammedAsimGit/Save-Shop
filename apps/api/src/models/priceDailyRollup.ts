import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

/**
 * Daily price rollups (Sprint 4).
 *
 * One document = one UTC day for one (product, source, marketplace, currency,
 * provenance) group. A rollup is written **only** from stored observations and is
 * insert-only: a rerun of the job never rewrites a completed day, so a partial
 * deletion crash cannot shrink a rollup that was already committed.
 *
 * Rolling forward explicitly (`replaceDay`) is the only way to recompute a day.
 */

const moneySchema = new Schema(
  {
    amountMinor: { type: Number, required: true, min: 1 },
    currency: { type: String, required: true, match: /^[A-Z]{3}$/ },
  },
  { _id: false },
);

const availabilitySchema = new Schema(
  {
    inStock: { type: Number, required: true, min: 0 },
    outOfStock: { type: Number, required: true, min: 0 },
    preorder: { type: Number, required: true, min: 0 },
    unknown: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const priceDailyRollupSchema = new Schema(
  {
    /** sha256 of product|source|marketplace|currency|verification|date. */
    rollupKey: { type: String, required: true },
    productId: { type: String, required: true, maxLength: 120 },
    sourceId: { type: String, required: true, maxLength: 80 },
    marketplaceId: { type: String, required: true, maxLength: 80 },
    currency: { type: String, required: true, match: /^[A-Z]{3}$/ },
    /** UTC calendar date (YYYY-MM-DD); the queryable form of `date`. */
    dateKey: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    /** Start of the UTC day, kept for range queries and audit. */
    date: { type: Date, required: true },
    minPrice: { type: moneySchema, required: true },
    maxPrice: { type: moneySchema, required: true },
    firstPrice: { type: moneySchema, required: true },
    lastPrice: { type: moneySchema, required: true },
    observationCount: { type: Number, required: true, min: 1 },
    availabilityCounts: { type: availabilitySchema, required: true },
    sourceVerification: { type: String, required: true, enum: ['verified', 'sample'] },
    isSample: { type: Boolean, required: true },
    generatedAt: { type: Date, required: true },
    windowStart: { type: Date, required: true },
    windowEnd: { type: Date, required: true },
  },
  { collection: 'price_daily_rollups', versionKey: false, timestamps: false },
);

// Idempotent generation: one document per group per day.
priceDailyRollupSchema.index({ rollupKey: 1 }, { unique: true });

// History reads, and the retention job's per-day verification.
priceDailyRollupSchema.index({ productId: 1, dateKey: 1 });
priceDailyRollupSchema.index({ productId: 1, sourceId: 1, dateKey: 1 });
priceDailyRollupSchema.index({ productId: 1, marketplaceId: 1, dateKey: 1 });

// Rollup retention pruning.
priceDailyRollupSchema.index({ dateKey: 1 });

export type PriceDailyRollupFields = InferSchemaType<typeof priceDailyRollupSchema>;

export const PriceDailyRollupModel: Model<PriceDailyRollupFields> =
  (mongoose.models['PriceDailyRollup'] as Model<PriceDailyRollupFields> | undefined) ??
  mongoose.model<PriceDailyRollupFields>('PriceDailyRollup', priceDailyRollupSchema);
