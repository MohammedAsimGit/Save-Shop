import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

/**
 * Canonical products (Sprint 5).
 *
 * One document = one product the platform says it knows. The catalogue is the only
 * authority for product identity: prices, history and comparisons all reference
 * `id` here, and a marketplace listing may only point at it through a recorded
 * match verdict.
 *
 * Identity rules encoded in the schema:
 * - `id` is a human-readable slug and is unique;
 * - `gtin`, when present, is unique: a GTIN identifies exactly one product, so a
 *   duplicate is a data error rather than a second product;
 * - `mpn` is indexed but NOT unique, because manufacturers reuse part numbers
 *   across regions and variants; uniqueness there would reject real data;
 * - variant records point at their base product through `variantOf`, so a colour
 *   or capacity stays distinct without being disconnected.
 *
 * Search fields are denormalized (`search.text`, `search.tokens`,
 * `search.brandKey`, `search.modelKey`) so deterministic, index-supported matching
 * does not need a text-search engine.
 */

const canonicalProductSchema = new Schema(
  {
    id: { type: String, required: true, maxLength: 120 },
    name: { type: String, required: true, maxLength: 200 },
    brand: { type: String, required: true, maxLength: 80 },
    category: { type: String, required: true, maxLength: 40 },
    model: { type: String, maxLength: 80 },
    mpn: { type: String, maxLength: 40 },
    gtin: { type: String, match: /^\d{14}$/ },
    description: { type: String, maxLength: 2000 },
    specifications: { type: Schema.Types.Mixed, default: {} },
    color: { type: String, maxLength: 40 },
    storageCapacity: { type: String, maxLength: 20 },
    variantOf: { type: String, default: null, maxLength: 120 },
    variantAttributes: { type: Schema.Types.Mixed, default: {} },
    imageUrls: { type: [String], default: [] },
    status: { type: String, required: true, enum: ['active', 'draft', 'archived'] },
    provenance: {
      type: String,
      required: true,
      enum: ['demo', 'manual', 'authorized_source'],
    },
    isSample: { type: Boolean, required: true },
    /**
     * Set when an administrator merged this record into another product. The source
     * is archived, never deleted: listings, snapshots and rollups move to the target,
     * and this field keeps the old id resolvable as a redirect.
     */
    mergedInto: { type: String, default: null, maxLength: 120 },
    mergedAt: { type: Date, default: null },
    /**
     * Merge run that claimed this source. The claim is a compare-and-set guard: it
     * stops two concurrent merges from moving the same listings, snapshots and
     * rollups into different targets. It is kept after the merge as the audit link
     * between the archived record and the run that archived it.
     */
    mergeRunId: { type: String, default: null, maxLength: 120 },
    /** Denormalized search keys; derived, never editable through the API. */
    search: {
      text: { type: String, required: true },
      tokens: { type: [String], default: [] },
      brandKey: { type: String, required: true },
      modelKey: { type: String, default: null },
    },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
  },
  { collection: 'canonical_products', versionKey: false, timestamps: false },
);

canonicalProductSchema.index({ id: 1 }, { unique: true });

// A GTIN identifies one product; absent GTINs must not collide with each other.
canonicalProductSchema.index(
  { gtin: 1 },
  { unique: true, partialFilterExpression: { gtin: { $type: 'string' } } },
);

canonicalProductSchema.index({ 'search.brandKey': 1, 'search.modelKey': 1 });
canonicalProductSchema.index({ 'search.tokens': 1 });
canonicalProductSchema.index({ category: 1, status: 1 });
canonicalProductSchema.index({ variantOf: 1 });
canonicalProductSchema.index({ mpn: 1 });
// Redirect lookups are on the hot path of every product read after a merge.
canonicalProductSchema.index({ mergedInto: 1 });

export type CanonicalProductFields = InferSchemaType<typeof canonicalProductSchema>;

export const CanonicalProductModel: Model<CanonicalProductFields> =
  (mongoose.models['CanonicalProduct'] as Model<CanonicalProductFields> | undefined) ??
  mongoose.model<CanonicalProductFields>('CanonicalProduct', canonicalProductSchema);
