import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

/**
 * Comparison response cache (Sprint 3).
 *
 * MongoDB rather than Redis, deliberately: the API already requires MongoDB for
 * snapshot persistence, so a cache in the same store adds no new infrastructure,
 * no second connection and no new operational secret. At this scale (one API
 * process, read-mostly comparison responses) a single unique-keyed collection is
 * enough, and the TTL monitor is only an eviction aid - correctness comes from
 * the stored `expiresAt`, which every read checks.
 */

const comparisonCacheSchema = new Schema(
  {
    /** Product + currency + enabled source set; see `comparisonCacheKey`. */
    key: { type: String, required: true },
    /** The exact `ProductComparisonResponse` that was returned to clients. */
    payload: { type: Schema.Types.Mixed, required: true },
    createdAt: { type: Date, required: true },
    /** Hard cut-off: a hit after this instant is treated as a miss. */
    expiresAt: { type: Date, required: true },
  },
  { collection: 'comparison_cache', versionKey: false, timestamps: false },
);

comparisonCacheSchema.index({ key: 1 }, { unique: true });
// Eviction only: reads never trust this to have run.
comparisonCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type ComparisonCacheFields = InferSchemaType<typeof comparisonCacheSchema>;

export const ComparisonCacheModel: Model<ComparisonCacheFields> =
  (mongoose.models['ComparisonCache'] as Model<ComparisonCacheFields> | undefined) ??
  mongoose.model<ComparisonCacheFields>('ComparisonCache', comparisonCacheSchema);
