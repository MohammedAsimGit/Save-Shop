import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

/**
 * Canonical product merge runs (Sprint 6).
 *
 * A merge is the most destructive administrative operation in the catalogue, so it
 * is planned first and recorded before any reference moves. The run document is the
 * recovery handle: if the process dies halfway, the run stays `pending` and the
 * recovery command re-applies the same idempotent reference migration instead of
 * guessing what happened.
 *
 * The source product is never deleted - it is archived with `mergedInto` set, so a
 * merge is always explainable and old links keep resolving.
 */

const mergeCountsSchema = new Schema(
  {
    listings: { type: Number, required: true, min: 0 },
    snapshots: { type: Number, required: true, min: 0 },
    snapshotsDeduped: { type: Number, required: true, min: 0 },
    rollups: { type: Number, required: true, min: 0 },
    rollupsCombined: { type: Number, required: true, min: 0 },
    variants: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const catalogueMergeRunSchema = new Schema(
  {
    id: { type: String, required: true, maxLength: 80 },
    sourceProductId: { type: String, required: true, maxLength: 120 },
    targetProductId: { type: String, required: true, maxLength: 120 },
    status: { type: String, required: true, enum: ['pending', 'completed', 'failed'] },
    reason: { type: String, required: true, maxLength: 240 },
    notes: { type: String, default: null, maxLength: 1000 },
    adminId: { type: String, required: true, maxLength: 60 },
    adminEmail: { type: String, required: true, maxLength: 200 },
    requestId: { type: String, default: null, maxLength: 80 },
    transactionUsed: { type: Boolean, required: true, default: false },
    acknowledgedConflicts: { type: [String], default: [] },
    /** Planned counts, captured before anything moved. */
    planned: { type: mergeCountsSchema, required: true },
    /** Actual counts, written when the run completes. */
    applied: { type: mergeCountsSchema, default: null },
    failureReason: { type: String, default: null, maxLength: 500 },
    startedAt: { type: Date, required: true },
    finishedAt: { type: Date, default: null },
  },
  { collection: 'catalogue_merge_runs', versionKey: false, timestamps: false },
);

catalogueMergeRunSchema.index({ id: 1 }, { unique: true });
catalogueMergeRunSchema.index({ status: 1, startedAt: -1 });
catalogueMergeRunSchema.index({ sourceProductId: 1 });
catalogueMergeRunSchema.index({ targetProductId: 1 });

export type CatalogueMergeRunFields = InferSchemaType<typeof catalogueMergeRunSchema>;

export const CatalogueMergeRunModel: Model<CatalogueMergeRunFields> =
  (mongoose.models['CatalogueMergeRun'] as Model<CatalogueMergeRunFields> | undefined) ??
  mongoose.model<CatalogueMergeRunFields>('CatalogueMergeRun', catalogueMergeRunSchema);
