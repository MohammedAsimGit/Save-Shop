import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

/**
 * Human review decisions (Sprint 6).
 *
 * One document = one administrative decision about one marketplace listing. The
 * collection is **append-only**: nothing here is ever updated or deleted, so the
 * question "who decided this, when, why, and against which matcher version?" stays
 * answerable after the listing's current state has moved on.
 *
 * The current decision is also embedded on the listing (`review`) so the matcher can
 * respect it without a join; this collection is the history behind that state.
 */

const catalogueReviewDecisionSchema = new Schema(
  {
    id: { type: String, required: true, maxLength: 80 },
    listingId: { type: String, required: true, maxLength: 120 },
    sourceId: { type: String, required: true, maxLength: 80 },
    marketplaceId: { type: String, required: true, maxLength: 80 },
    decision: {
      type: String,
      required: true,
      enum: ['accepted', 'rejected', 'reassigned', 'deferred', 'reopened'],
    },
    previousStatus: {
      type: String,
      required: true,
      enum: ['exact', 'strong', 'possible', 'unmatched', 'conflict'],
    },
    previousCanonicalProductId: { type: String, default: null, maxLength: 120 },
    newCanonicalProductId: { type: String, default: null, maxLength: 120 },
    rejectedProductId: { type: String, default: null, maxLength: 120 },
    adminId: { type: String, required: true, maxLength: 60 },
    /** Kept for audit; the admin profile itself never exposes an email publicly. */
    adminEmail: { type: String, required: true, maxLength: 200 },
    reason: { type: String, required: true, maxLength: 240 },
    notes: { type: String, default: null, maxLength: 1000 },
    /** Identity facts the decision was made on (brand, gtin, model, ...). */
    identityFacts: { type: Schema.Types.Mixed, default: {} },
    matcherVersion: { type: String, required: true, maxLength: 40 },
    requestId: { type: String, default: null, maxLength: 80 },
    listingRevision: { type: Number, required: true, min: 0 },
    decidedAt: { type: Date, required: true },
  },
  { collection: 'catalogue_review_decisions', versionKey: false, timestamps: false },
);

// Decision history for one listing, newest last.
catalogueReviewDecisionSchema.index({ listingId: 1, decidedAt: 1 });
// "What did this administrator do?" and "what happened to this product?".
catalogueReviewDecisionSchema.index({ adminId: 1, decidedAt: -1 });
catalogueReviewDecisionSchema.index({ newCanonicalProductId: 1, decidedAt: -1 });

export type CatalogueReviewDecisionFields = InferSchemaType<typeof catalogueReviewDecisionSchema>;

export const CatalogueReviewDecisionModel: Model<CatalogueReviewDecisionFields> =
  (mongoose.models['CatalogueReviewDecision'] as
    Model<CatalogueReviewDecisionFields> | undefined) ??
  mongoose.model<CatalogueReviewDecisionFields>(
    'CatalogueReviewDecision',
    catalogueReviewDecisionSchema,
  );
