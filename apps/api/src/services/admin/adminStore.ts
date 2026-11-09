import type {
  AdminRole,
  AdminStatus,
  AuditEvent,
  AuditQuery,
  ReviewDecisionRecord,
} from '@smart-shopping/shared';

/**
 * Administration persistence.
 *
 * Four small collections share one abstraction because they are written together by
 * the same privileged requests: administrators, review decisions (append-only),
 * audit events (append-only) and merge runs (the recovery handle).
 *
 * Two implementations exist: MongoDB for real runs and an in-memory store for tests
 * and DB-less development. The memory store enforces the same append-only rules, so
 * a test cannot pass on behaviour production does not have.
 */

export interface AdminUserRecord {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly role: AdminRole;
  readonly status: AdminStatus;
  readonly passwordHash: string;
  readonly tokenVersion: number;
  readonly lastLoginAt: Date | null;
  readonly passwordUpdatedAt: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface MergeCountsRecord {
  readonly listings: number;
  readonly snapshots: number;
  readonly snapshotsDeduped: number;
  readonly rollups: number;
  readonly rollupsCombined: number;
  readonly variants: number;
}

export interface MergeRunRecord {
  readonly id: string;
  readonly sourceProductId: string;
  readonly targetProductId: string;
  readonly status: 'pending' | 'completed' | 'failed';
  readonly reason: string;
  readonly notes: string | null;
  readonly adminId: string;
  readonly adminEmail: string;
  readonly requestId: string | null;
  readonly transactionUsed: boolean;
  readonly acknowledgedConflicts: readonly string[];
  readonly planned: MergeCountsRecord;
  readonly applied: MergeCountsRecord | null;
  readonly failureReason: string | null;
  readonly startedAt: Date;
  readonly finishedAt: Date | null;
}

export interface AdminAuditPage {
  readonly events: readonly AuditEvent[];
  readonly totalItems: number;
}

export interface AdminStore {
  readonly kind: 'memory' | 'mongodb';

  createAdmin(record: AdminUserRecord): Promise<{ created: boolean }>;
  findAdminByEmail(email: string): Promise<AdminUserRecord | null>;
  findAdminById(id: string): Promise<AdminUserRecord | null>;
  listAdmins(): Promise<AdminUserRecord[]>;
  updateAdmin(
    id: string,
    patch: Partial<
      Pick<
        AdminUserRecord,
        | 'displayName'
        | 'status'
        | 'passwordHash'
        | 'tokenVersion'
        | 'lastLoginAt'
        | 'passwordUpdatedAt'
      >
    >,
  ): Promise<AdminUserRecord | null>;

  /** Append-only: there is deliberately no update or delete method. */
  appendDecision(record: ReviewDecisionRecord): Promise<void>;
  listDecisions(listingId: string, limit: number): Promise<ReviewDecisionRecord[]>;

  /** Append-only audit trail. */
  appendAudit(event: AuditEvent): Promise<void>;
  listAudit(query: AuditQuery): Promise<AdminAuditPage>;

  createMergeRun(run: MergeRunRecord): Promise<void>;
  updateMergeRun(
    id: string,
    patch: Partial<
      Pick<
        MergeRunRecord,
        'status' | 'applied' | 'failureReason' | 'finishedAt' | 'transactionUsed'
      >
    >,
  ): Promise<MergeRunRecord | null>;
  findMergeRun(id: string): Promise<MergeRunRecord | null>;
  listOpenMergeRuns(limit: number): Promise<MergeRunRecord[]>;
}

export function createMemoryAdminStore(): AdminStore {
  const admins = new Map<string, AdminUserRecord>();
  const decisions: ReviewDecisionRecord[] = [];
  const audit: AuditEvent[] = [];
  const mergeRuns = new Map<string, MergeRunRecord>();

  return {
    kind: 'memory',

    async createAdmin(record) {
      for (const admin of admins.values()) {
        if (admin.email === record.email) return { created: false };
      }
      if (admins.has(record.id)) return { created: false };
      admins.set(record.id, record);
      return { created: true };
    },

    async findAdminByEmail(email) {
      for (const admin of admins.values()) {
        if (admin.email === email) return admin;
      }
      return null;
    },

    async findAdminById(id) {
      return admins.get(id) ?? null;
    },

    async listAdmins() {
      return [...admins.values()].sort((a, b) => a.email.localeCompare(b.email));
    },

    async updateAdmin(id, patch) {
      const prior = admins.get(id);
      if (!prior) return null;
      const updated: AdminUserRecord = {
        ...prior,
        ...patch,
        updatedAt: new Date(),
      };
      admins.set(id, updated);
      return updated;
    },

    async appendDecision(record) {
      decisions.push(record);
    },

    async listDecisions(listingId, limit) {
      return decisions
        .filter((record) => record.listingId === listingId)
        .sort((a, b) => a.decidedAt.localeCompare(b.decidedAt))
        .slice(-limit);
    },

    async appendAudit(event) {
      audit.push(event);
    },

    async listAudit(query) {
      const filtered = audit
        .filter((event) => {
          if (query.action && event.action !== query.action) return false;
          if (query.actorId && event.actorId !== query.actorId) return false;
          if (query.targetId && event.targetId !== query.targetId) return false;
          return true;
        })
        .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));

      const start = (query.page - 1) * query.pageSize;
      return {
        events: filtered.slice(start, start + query.pageSize),
        totalItems: filtered.length,
      };
    },

    async createMergeRun(run) {
      mergeRuns.set(run.id, run);
    },

    async updateMergeRun(id, patch) {
      const prior = mergeRuns.get(id);
      if (!prior) return null;
      const updated = { ...prior, ...patch };
      mergeRuns.set(id, updated);
      return updated;
    },

    async findMergeRun(id) {
      return mergeRuns.get(id) ?? null;
    },

    async listOpenMergeRuns(limit) {
      return [...mergeRuns.values()]
        .filter((run) => run.status !== 'completed')
        .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())
        .slice(0, limit);
    },
  };
}
