import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { catalogueStore } from '../catalogue/index.js';
import { rollupStore } from '../rollups/index.js';
import { snapshotStore } from '../snapshots/index.js';
import { createMemoryAdminStore, type AdminStore } from './adminStore.js';
import { createAdminAuthService, type AdminAuthService } from './auth.service.js';
import { createMergeService, type MergeService } from './merge.service.js';
import { createMongoAdminStore } from './mongoAdminStore.js';
import { createReviewService, type ReviewService } from './review.service.js';

export type { AdminActor, AdminAuthService } from './auth.service.js';
export type { AdminStore } from './adminStore.js';
export type { ReviewService, DecisionAction } from './review.service.js';
export type { MergeService } from './merge.service.js';
export { createAdminAuthService } from './auth.service.js';
export { createReviewService } from './review.service.js';
export { createMergeService } from './merge.service.js';
export { createMemoryAdminStore } from './adminStore.js';
export { recordAudit } from './audit.js';

/**
 * Chooses the administration store once per process, exactly like the catalogue
 * and snapshot stores: MongoDB when configured, memory otherwise.
 *
 * The memory fallback has an important consequence for administrators: there are
 * no accounts, so every admin endpoint returns 401 until the process is backed by
 * MongoDB and an administrator has been provisioned. That is the safe failure mode
 * for a security feature - closed, not accidentally open.
 */
export function createAdminStore(): AdminStore {
  if (!env.isDatabaseConfigured) {
    logger.warn(
      'MONGODB_URI is not set - catalogue administration uses an in-memory store. Admin endpoints stay closed until a database and a provisioned administrator exist.',
    );
    return createMemoryAdminStore();
  }

  logger.info(
    'Catalogue administration: MongoDB collections "admin_users", "catalogue_review_decisions", "catalogue_audit_events", "catalogue_merge_runs"',
  );
  return createMongoAdminStore();
}

export const adminStore: AdminStore = createAdminStore();

export const adminAuthService: AdminAuthService = createAdminAuthService({
  store: adminStore,
  secret: env.adminJwtSecret,
  sessionTtlSeconds: env.adminSessionTtlSeconds,
  loginMaxAttempts: env.adminLoginMaxAttempts,
  loginWindowSeconds: env.adminLoginWindowSeconds,
});

export const reviewService: ReviewService = createReviewService({
  store: catalogueStore,
  adminStore,
});

export const mergeService: MergeService = createMergeService({
  catalogue: catalogueStore,
  snapshots: snapshotStore,
  rollups: rollupStore,
  adminStore,
});
