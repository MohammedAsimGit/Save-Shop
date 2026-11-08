import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

/**
 * Retention run audit (Sprint 4).
 *
 * One document per compaction run, successful or not. Deletions are destructive,
 * so "what did the last job actually remove, over which range, in dry-run or not"
 * must be answerable from the database rather than from a terminal scrollback.
 */

const retentionRunSchema = new Schema(
  {
    startedAt: { type: Date, required: true },
    finishedAt: { type: Date, required: true },
    dryRun: { type: Boolean, required: true },
    status: { type: String, required: true, enum: ['completed', 'aborted'] },
    rawRetentionDays: { type: Number, required: true },
    rollupRetentionDays: { type: Number, required: true },
    batchSize: { type: Number, required: true },
    rawCutoff: { type: Date, required: true },
    rollupCutoff: { type: Date, required: true },
    /** UTC days the run touched, when it touched any. */
    dateRange: {
      type: new Schema(
        { from: { type: String, required: true }, to: { type: String, required: true } },
        { _id: false },
      ),
      default: null,
    },
    stats: { type: Schema.Types.Mixed, required: true },
    failedDays: { type: [Schema.Types.Mixed], default: [] },
  },
  { collection: 'retention_runs', versionKey: false, timestamps: false },
);

retentionRunSchema.index({ startedAt: -1 });

export type RetentionRunFields = InferSchemaType<typeof retentionRunSchema>;

export const RetentionRunModel: Model<RetentionRunFields> =
  (mongoose.models['RetentionRun'] as Model<RetentionRunFields> | undefined) ??
  mongoose.model<RetentionRunFields>('RetentionRun', retentionRunSchema);
