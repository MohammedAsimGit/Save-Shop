import type { AuditEvent, ReviewDecisionRecord } from '@smart-shopping/shared';

import { AdminUserModel, type AdminUserFields } from '../../models/adminUser.js';
import { CatalogueAuditEventModel } from '../../models/catalogueAuditEvent.js';
import { CatalogueMergeRunModel } from '../../models/catalogueMergeRun.js';
import { CatalogueReviewDecisionModel } from '../../models/catalogueReviewDecision.js';
import type { AdminStore, AdminUserRecord, MergeRunRecord } from './adminStore.js';

/**
 * MongoDB administration store.
 *
 * Decisions and audit events are written with `create` and never updated; the
 * append-only rule is structural, not a convention. Merge runs are the only mutable
 * documents here because a run has a lifecycle (pending -> completed/failed) and is
 * the recovery handle after a crash.
 */

function toDomainAdmin(document: AdminUserFields): AdminUserRecord {
  return {
    id: document.id,
    email: document.email,
    displayName: document.displayName,
    role: document.role as AdminUserRecord['role'],
    status: document.status as AdminUserRecord['status'],
    passwordHash: document.passwordHash,
    tokenVersion: document.tokenVersion,
    lastLoginAt: document.lastLoginAt ? new Date(document.lastLoginAt) : null,
    passwordUpdatedAt: new Date(document.passwordUpdatedAt),
    createdAt: new Date(document.createdAt),
    updatedAt: new Date(document.updatedAt),
  };
}

function isDuplicateKey(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 11000
  );
}

export function createMongoAdminStore(): AdminStore {
  return {
    kind: 'mongodb',

    async createAdmin(record) {
      try {
        await AdminUserModel.create({ ...record });
        return { created: true };
      } catch (error) {
        // The unique email index is the real guard against two accounts for one
        // person; a duplicate is reported, never retried with a different address.
        if (isDuplicateKey(error)) return { created: false };
        throw error;
      }
    },

    async findAdminByEmail(email) {
      const document = await AdminUserModel.findOne({ email }).lean<AdminUserFields>();
      return document ? toDomainAdmin(document) : null;
    },

    async findAdminById(id) {
      const document = await AdminUserModel.findOne({ id }).lean<AdminUserFields>();
      return document ? toDomainAdmin(document) : null;
    },

    async listAdmins() {
      const documents = await AdminUserModel.find({}).sort({ email: 1 }).lean<AdminUserFields[]>();
      return documents.map(toDomainAdmin);
    },

    async updateAdmin(id, patch) {
      const document = await AdminUserModel.findOneAndUpdate(
        { id },
        { $set: { ...patch, updatedAt: new Date() } },
        { new: true },
      ).lean<AdminUserFields | null>();
      return document ? toDomainAdmin(document) : null;
    },

    async appendDecision(record) {
      await CatalogueReviewDecisionModel.create({
        ...record,
        decidedAt: new Date(record.decidedAt),
      });
    },

    async listDecisions(listingId, limit) {
      const documents = await CatalogueReviewDecisionModel.find({ listingId })
        .sort({ decidedAt: 1 })
        .limit(limit)
        .lean();

      return documents.slice(-limit).map((document) => ({
        id: document.id,
        listingId: document.listingId,
        sourceId: document.sourceId,
        marketplaceId: document.marketplaceId,
        decision: document.decision as ReviewDecisionRecord['decision'],
        previousStatus: document.previousStatus as ReviewDecisionRecord['previousStatus'],
        previousCanonicalProductId: document.previousCanonicalProductId ?? null,
        newCanonicalProductId: document.newCanonicalProductId ?? null,
        rejectedProductId: document.rejectedProductId ?? null,
        adminId: document.adminId,
        adminEmail: document.adminEmail,
        reason: document.reason,
        notes: document.notes ?? null,
        identityFacts: (document.identityFacts ?? {}) as Record<string, string>,
        matcherVersion: document.matcherVersion,
        requestId: document.requestId ?? null,
        listingRevision: document.listingRevision,
        decidedAt: new Date(document.decidedAt).toISOString(),
      }));
    },

    async appendAudit(event) {
      await CatalogueAuditEventModel.create({
        ...event,
        occurredAt: new Date(event.occurredAt),
      });
    },

    async listAudit(query) {
      const filter: Record<string, unknown> = {};
      if (query.action) filter.action = query.action;
      if (query.actorId) filter.actorId = query.actorId;
      if (query.targetId) filter.targetId = query.targetId;

      const [documents, totalItems] = await Promise.all([
        CatalogueAuditEventModel.find(filter)
          .sort({ occurredAt: -1 })
          .skip((query.page - 1) * query.pageSize)
          .limit(query.pageSize)
          .lean(),
        CatalogueAuditEventModel.countDocuments(filter),
      ]);

      const events: AuditEvent[] = documents.map((document) => ({
        id: document.id,
        action: document.action as AuditEvent['action'],
        actorId: document.actorId ?? null,
        actorEmail: document.actorEmail ?? null,
        targetType: document.targetType as AuditEvent['targetType'],
        targetId: document.targetId ?? null,
        previousState: (document.previousState ?? {}) as Record<string, unknown>,
        newState: (document.newState ?? {}) as Record<string, unknown>,
        reason: document.reason ?? null,
        requestId: document.requestId ?? null,
        occurredAt: new Date(document.occurredAt).toISOString(),
      }));

      return { events, totalItems };
    },

    async createMergeRun(run) {
      await CatalogueMergeRunModel.create({
        ...run,
        acknowledgedConflicts: [...run.acknowledgedConflicts],
      });
    },

    async updateMergeRun(id, patch) {
      const document = await CatalogueMergeRunModel.findOneAndUpdate(
        { id },
        { $set: patch },
        { new: true },
      ).lean();
      return document ? (document as unknown as MergeRunRecord) : null;
    },

    async findMergeRun(id) {
      const document = await CatalogueMergeRunModel.findOne({ id }).lean();
      return document ? (document as unknown as MergeRunRecord) : null;
    },

    async listOpenMergeRuns(limit) {
      const documents = await CatalogueMergeRunModel.find({ status: { $ne: 'completed' } })
        .sort({ startedAt: 1 })
        .limit(limit)
        .lean();
      return documents as unknown as MergeRunRecord[];
    },
  };
}
