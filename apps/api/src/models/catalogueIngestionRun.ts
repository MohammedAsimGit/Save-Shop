import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

/**
 * Catalogue ingestion audit (Sprint 5).
 *
 * One document per ingestion run. Ingestion decides what a marketplace item claims
 * to be, so "which records were rejected, and why" must be answerable later rather
 * than living only in terminal scrollback. Rejected records keep their reason and
 * the offending field/value; nothing is silently dropped.
 */

const catalogueIngestionRunSchema = new Schema(
  {
    startedAt: { type: Date, required: true },
    finishedAt: { type: Date, required: true },
    dryRun: { type: Boolean, required: true },
    status: { type: String, required: true, enum: ['completed', 'failed'] },
    /** Sources consulted in this run, in order. */
    sources: { type: [String], default: [] },
    recordsRead: { type: Number, required: true },
    accepted: { type: Number, required: true },
    rejected: { type: Number, required: true },
    created: { type: Number, required: true },
    updated: { type: Number, required: true },
    unchanged: { type: Number, required: true },
    canonicalProductsInserted: { type: Number, required: true },
    matches: { type: Schema.Types.Mixed, required: true },
    /** Per-record rejection reasons; the full report, not a count. */
    rejectedRecords: { type: [Schema.Types.Mixed], default: [] },
    warnings: { type: [String], default: [] },
  },
  { collection: 'catalogue_ingestion_runs', versionKey: false, timestamps: false },
);

catalogueIngestionRunSchema.index({ startedAt: -1 });

export type CatalogueIngestionRunFields = InferSchemaType<typeof catalogueIngestionRunSchema>;

export const CatalogueIngestionRunModel: Model<CatalogueIngestionRunFields> =
  (mongoose.models['CatalogueIngestionRun'] as Model<CatalogueIngestionRunFields> | undefined) ??
  mongoose.model<CatalogueIngestionRunFields>('CatalogueIngestionRun', catalogueIngestionRunSchema);
