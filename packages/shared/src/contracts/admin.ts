import { z } from 'zod';

import {
  catalogueProductIdSchema,
  marketplaceListingSchema,
  matchMethodSchema,
  matchStatusSchema,
  reviewDecisionTypeSchema,
} from './catalogue.js';
import { isoDateTimeSchema } from './comparison.js';

/**
 * Catalogue administration contracts (Sprint 6).
 *
 * The admin surface is deliberately separate from the shopper API: it is the only
 * place a human can override automatic product identity, and every action produces
 * an append-only decision record plus an audit event. Nothing here is ever returned
 * to an unauthenticated caller.
 */

/** The single administrator role this sprint defines; the enum leaves room to grow. */
export const adminRoleSchema = z.enum(['catalogue_admin']);
export type AdminRole = z.infer<typeof adminRoleSchema>;

export const adminStatusSchema = z.enum(['active', 'disabled']);
export type AdminStatus = z.infer<typeof adminStatusSchema>;

/** A credential-free administrator profile. Password hashes never leave the API. */
export const adminProfileSchema = z.object({
  id: z.string().min(1).max(60),
  email: z.string().email().max(200),
  displayName: z.string().min(1).max(80),
  role: adminRoleSchema,
  status: adminStatusSchema,
  createdAt: isoDateTimeSchema,
  lastLoginAt: isoDateTimeSchema.nullable(),
});
export type AdminProfile = z.infer<typeof adminProfileSchema>;

const emailSchema = z.string().trim().toLowerCase().email().max(200);

/**
 * Login input. The password bounds are about request shape, not password policy:
 * the policy is enforced when an administrator is provisioned, and a login must
 * never reveal which half of a credential pair was wrong.
 */
export const adminLoginRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200),
});
export type AdminLoginRequest = z.infer<typeof adminLoginRequestSchema>;

export const adminSessionResponseSchema = z.object({
  token: z.string().min(1).max(4096),
  tokenType: z.literal('Bearer'),
  expiresAt: isoDateTimeSchema,
  admin: adminProfileSchema,
});
export type AdminSessionResponse = z.infer<typeof adminSessionResponseSchema>;

/* -------------------------------------------------------------------------- */
/* Review queue                                                               */
/* -------------------------------------------------------------------------- */

export const reviewQueueScopeSchema = z.enum(['pending', 'decided', 'all']);
export const reviewQueueSortSchema = z.enum([
  'oldest',
  'newest',
  'confidence_asc',
  'confidence_desc',
]);

/**
 * Queue filters. Every bound is explicit so a client cannot ask for an unbounded
 * scan; `pageSize` is capped well below the public catalogue's maximum because
 * each row carries candidates.
 */
export const reviewQueueQuerySchema = z.object({
  scope: reviewQueueScopeSchema.default('pending'),
  verdict: matchStatusSchema.optional(),
  sourceId: z.string().trim().max(80).optional(),
  marketplaceId: z.string().trim().max(80).optional(),
  canonicalProductId: catalogueProductIdSchema.optional(),
  q: z.string().trim().max(120).optional(),
  sort: reviewQueueSortSchema.default('oldest'),
  page: z.coerce.number().int().min(1).max(500).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});
export type ReviewQueueQuery = z.infer<typeof reviewQueueQuerySchema>;

/** One candidate canonical product the matcher or a human may choose. */
export const reviewCandidateSchema = z.object({
  productId: catalogueProductIdSchema,
  name: z.string().min(1).max(200),
  brand: z.string().min(1).max(80),
  category: z.string().min(1).max(40),
  /** How the deterministic rules score this candidate for this listing. */
  status: matchStatusSchema,
  method: matchMethodSchema,
  /** Strength score 0-100, not a probability. */
  confidence: z.number().int().min(0).max(100),
  reasons: z.array(z.string().max(160)).max(6),
  isSample: z.boolean(),
  mergedInto: catalogueProductIdSchema.nullable(),
});
export type ReviewCandidate = z.infer<typeof reviewCandidateSchema>;

export const reviewQueueItemSchema = z.object({
  listing: marketplaceListingSchema,
  candidates: z.array(reviewCandidateSchema).max(5),
  /** Identity facts that contradict every candidate (or the accepted product). */
  conflicts: z.array(z.string().max(160)).max(8),
  /** Why a human is being asked, in one sentence. */
  reviewRequiredReason: z.string().min(1).max(300),
  pending: z.boolean(),
});
export type ReviewQueueItem = z.infer<typeof reviewQueueItemSchema>;

export const reviewQueueResponseSchema = z.object({
  items: z.array(reviewQueueItemSchema),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  totalItems: z.number().int().min(0),
  counts: z.object({
    pending: z.number().int().min(0),
    decided: z.number().int().min(0),
    requiresReview: z.number().int().min(0),
    byVerdict: z.record(matchStatusSchema, z.number().int().min(0)),
  }),
  notices: z.array(z.string().max(300)),
});
export type ReviewQueueResponse = z.infer<typeof reviewQueueResponseSchema>;

/** Append-only record of one human decision, as stored in `catalogue_review_decisions`. */
export const reviewDecisionRecordSchema = z.object({
  id: z.string().min(1).max(80),
  listingId: z.string().min(1).max(120),
  sourceId: z.string().min(1).max(80),
  marketplaceId: z.string().min(1).max(80),
  decision: reviewDecisionTypeSchema,
  previousStatus: matchStatusSchema,
  previousCanonicalProductId: catalogueProductIdSchema.nullable(),
  newCanonicalProductId: catalogueProductIdSchema.nullable(),
  rejectedProductId: catalogueProductIdSchema.nullable(),
  adminId: z.string().min(1).max(60),
  adminEmail: z.string().email().max(200),
  reason: z.string().min(1).max(240),
  notes: z.string().max(1000).nullable(),
  /** The identity facts the decision was made on, captured at decision time. */
  identityFacts: z.record(z.string(), z.string()),
  matcherVersion: z.string().min(1).max(40),
  requestId: z.string().max(80).nullable(),
  listingRevision: z.number().int().min(0),
  decidedAt: isoDateTimeSchema,
});
export type ReviewDecisionRecord = z.infer<typeof reviewDecisionRecordSchema>;

/* -------------------------------------------------------------------------- */
/* Audit trail (declared before the detail response that embeds it)           */
/* -------------------------------------------------------------------------- */

/** Shared fields of every decision: a reason, optional notes, expected revision. */
const decisionBase = {
  expectedRevision: z.number().int().min(0),
  reason: z.string().trim().min(3).max(240),
  notes: z.string().trim().max(1000).optional(),
};

/**
 * `confirmConflicts` is how an administrator acknowledges that the automatic rules
 * disagree. It never bypasses the existence check, the revision check or the audit
 * trail; it only records that a human accepted the risk knowingly.
 */
export const acceptMatchRequestSchema = z.object({
  canonicalProductId: catalogueProductIdSchema,
  confirmConflicts: z.boolean().default(false),
  ...decisionBase,
});
export type AcceptMatchRequest = z.infer<typeof acceptMatchRequestSchema>;

export const rejectMatchRequestSchema = z.object({
  canonicalProductId: catalogueProductIdSchema.optional(),
  ...decisionBase,
});
export type RejectMatchRequest = z.infer<typeof rejectMatchRequestSchema>;

export const reassignMatchRequestSchema = acceptMatchRequestSchema;
export type ReassignMatchRequest = z.infer<typeof reassignMatchRequestSchema>;

export const deferMatchRequestSchema = z.object(decisionBase);
export type DeferMatchRequest = z.infer<typeof deferMatchRequestSchema>;

export const reopenMatchRequestSchema = z.object(decisionBase);
export type ReopenMatchRequest = z.infer<typeof reopenMatchRequestSchema>;

export const reviewDecisionResponseSchema = z.object({
  listing: marketplaceListingSchema,
  decision: reviewDecisionRecordSchema,
  /** Present when the decision required an explicit acknowledgement. */
  acknowledgedConflicts: z.array(z.string().max(160)).max(8),
  notices: z.array(z.string().max(300)),
});
export type ReviewDecisionResponse = z.infer<typeof reviewDecisionResponseSchema>;

/* -------------------------------------------------------------------------- */
/* Canonical product merge                                                    */
/* -------------------------------------------------------------------------- */

export const mergeRequestSchema = z.object({
  sourceProductId: catalogueProductIdSchema,
  targetProductId: catalogueProductIdSchema,
  reason: z.string().trim().min(3).max(240),
  notes: z.string().trim().max(1000).optional(),
  /** Required when identifiers or variants differ; never skips validation. */
  confirmConflicts: z.boolean().default(false),
});
export type MergeRequest = z.infer<typeof mergeRequestSchema>;

/** GET /admin/catalogue/merge-preview?sourceProductId=&targetProductId= */
export const mergePreviewQuerySchema = z.object({
  sourceProductId: catalogueProductIdSchema,
  targetProductId: catalogueProductIdSchema,
});
export type MergePreviewQuery = z.infer<typeof mergePreviewQuerySchema>;

export const mergePreviewResponseSchema = z.object({
  sourceProductId: catalogueProductIdSchema,
  targetProductId: catalogueProductIdSchema,
  compatible: z.boolean(),
  /** Reasons a merge is refused outright; confirmation cannot override these. */
  blockers: z.array(z.string().max(240)).max(10),
  /** Differences an administrator must acknowledge with `confirmConflicts`. */
  conflicts: z.array(z.string().max(240)).max(10),
  summary: z.object({
    listings: z.number().int().min(0),
    snapshots: z.number().int().min(0),
    rollups: z.number().int().min(0),
    variants: z.number().int().min(0),
  }),
  notices: z.array(z.string().max(300)),
});
export type MergePreviewResponse = z.infer<typeof mergePreviewResponseSchema>;

export const mergeRunStatusSchema = z.enum(['pending', 'completed', 'failed']);

export const mergeResponseSchema = z.object({
  mergeRunId: z.string().min(1).max(80),
  status: mergeRunStatusSchema,
  sourceProductId: catalogueProductIdSchema,
  targetProductId: catalogueProductIdSchema,
  /** True when the reference migration ran inside a MongoDB transaction. */
  transactionUsed: z.boolean(),
  listingsMoved: z.number().int().min(0),
  snapshotsMoved: z.number().int().min(0),
  snapshotsDeduped: z.number().int().min(0),
  rollupsMoved: z.number().int().min(0),
  rollupsCombined: z.number().int().min(0),
  variantsRepointed: z.number().int().min(0),
  acknowledgedConflicts: z.array(z.string().max(240)).max(10),
  notices: z.array(z.string().max(300)),
});
export type MergeResponse = z.infer<typeof mergeResponseSchema>;

export const auditActionSchema = z.enum([
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
]);
export type AuditAction = z.infer<typeof auditActionSchema>;

export const auditTargetTypeSchema = z.enum(['listing', 'product', 'admin', 'session', 'system']);

/**
 * Append-only audit event. `previousState`/`newState` hold only fields that are
 * safe to keep forever: never a password, a hash, a token or a secret.
 */
export const auditEventSchema = z.object({
  id: z.string().min(1).max(80),
  action: auditActionSchema,
  actorId: z.string().min(1).max(60).nullable(),
  actorEmail: z.string().email().max(200).nullable(),
  targetType: auditTargetTypeSchema,
  targetId: z.string().min(1).max(120).nullable(),
  previousState: z.record(z.string(), z.unknown()).default({}),
  newState: z.record(z.string(), z.unknown()).default({}),
  reason: z.string().max(240).nullable(),
  requestId: z.string().max(80).nullable(),
  occurredAt: isoDateTimeSchema,
});
export type AuditEvent = z.infer<typeof auditEventSchema>;

export const auditQuerySchema = z.object({
  action: auditActionSchema.optional(),
  actorId: z.string().trim().max(60).optional(),
  targetId: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).max(500).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type AuditQuery = z.infer<typeof auditQuerySchema>;

export const auditResponseSchema = z.object({
  events: z.array(auditEventSchema),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  totalItems: z.number().int().min(0),
});
export type AuditResponse = z.infer<typeof auditResponseSchema>;

export const listingDetailResponseSchema = z.object({
  item: reviewQueueItemSchema,
  decisions: z.array(reviewDecisionRecordSchema),
  audit: z.array(auditEventSchema),
  notices: z.array(z.string().max(300)),
});
export type ListingDetailResponse = z.infer<typeof listingDetailResponseSchema>;
