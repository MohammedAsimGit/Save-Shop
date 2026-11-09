import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

/**
 * Catalogue administration audit trail (Sprint 6).
 *
 * Append-only: an audit event is a fact about the past, so this collection never
 * accepts an update or a delete. Every privileged action records the actor, the
 * target, the previous and new state, the reason and the request id that ties it to
 * the API log.
 *
 * Deliberate exclusions: passwords, password hashes, session tokens and any other
 * secret are never written here. `previousState`/`newState` are built from an
 * explicit allowlist of fields by the service, not by dumping a document.
 */

const catalogueAuditEventSchema = new Schema(
  {
    id: { type: String, required: true, maxLength: 80 },
    action: {
      type: String,
      required: true,
      enum: [
        'admin.login',
        'admin.login_failed',
        'admin.provisioned',
        'admin.disabled',
        'admin.password_reset',
        'match.accepted',
        'match.rejected',
        'match.reassigned',
        'match.deferred',
        'match.reopened',
        'product.merged',
        'admin.forbidden',
      ],
    },
    actorId: { type: String, default: null, maxLength: 60 },
    actorEmail: { type: String, default: null, maxLength: 200 },
    targetType: {
      type: String,
      required: true,
      enum: ['listing', 'product', 'admin', 'session', 'system'],
    },
    targetId: { type: String, default: null, maxLength: 120 },
    previousState: { type: Schema.Types.Mixed, default: {} },
    newState: { type: Schema.Types.Mixed, default: {} },
    reason: { type: String, default: null, maxLength: 240 },
    requestId: { type: String, default: null, maxLength: 80 },
    occurredAt: { type: Date, required: true },
  },
  { collection: 'catalogue_audit_events', versionKey: false, timestamps: false },
);

// Newest-first reads for the audit page, plus per-actor and per-target history.
catalogueAuditEventSchema.index({ occurredAt: -1 });
catalogueAuditEventSchema.index({ action: 1, occurredAt: -1 });
catalogueAuditEventSchema.index({ actorId: 1, occurredAt: -1 });
catalogueAuditEventSchema.index({ targetId: 1, occurredAt: -1 });

export type CatalogueAuditEventFields = InferSchemaType<typeof catalogueAuditEventSchema>;

export const CatalogueAuditEventModel: Model<CatalogueAuditEventFields> =
  (mongoose.models['CatalogueAuditEvent'] as Model<CatalogueAuditEventFields> | undefined) ??
  mongoose.model<CatalogueAuditEventFields>('CatalogueAuditEvent', catalogueAuditEventSchema);
