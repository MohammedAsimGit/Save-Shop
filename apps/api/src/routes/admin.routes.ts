import { Router } from 'express';
import { z } from 'zod';

import {
  acceptMatchRequestSchema,
  adminLoginRequestSchema,
  auditQuerySchema,
  deferMatchRequestSchema,
  mergePreviewQuerySchema,
  mergeRequestSchema,
  rejectMatchRequestSchema,
  reopenMatchRequestSchema,
  reviewQueueQuerySchema,
} from '@smart-shopping/shared';

import {
  acceptMatch,
  deferMatch,
  getAuditTrail,
  getMergePreview,
  getReviewListing,
  getReviewQueue,
  mergeProducts,
  reassignMatch,
  rejectMatch,
  reopenMatch,
} from '../controllers/adminCatalogue.controller.js';
import { login, me } from '../controllers/adminAuth.controller.js';
import { createAdminAuthMiddleware } from '../middlewares/adminAuth.js';
import { validateBody, validateParams, validateQuery } from '../middlewares/validate.js';
import { adminAuthService } from '../services/admin/index.js';

/**
 * Catalogue administration API.
 *
 * The only public route is `POST /admin/auth/login`. Everything else is mounted
 * behind `requireAdmin`, which verifies an HS256 bearer token and then reloads the
 * administrator: authorisation is decided from the stored role and status, never
 * from the token's claims alone and never from anything the client sends.
 *
 * There is deliberately no route that creates an administrator. Accounts come from
 * the provisioning CLI, so no API caller - authenticated or not - can mint one.
 */

const listingParamsSchema = z.object({
  listingId: z.string().min(1).max(120),
});

const requireAdmin = createAdminAuthMiddleware(adminAuthService);

const catalogueRouter: Router = Router();
catalogueRouter.use(requireAdmin);

catalogueRouter.get('/review-queue', validateQuery(reviewQueueQuerySchema), getReviewQueue);

catalogueRouter.get('/merge-preview', validateQuery(mergePreviewQuerySchema), getMergePreview);

catalogueRouter.post('/products/merge', validateBody(mergeRequestSchema), mergeProducts);

catalogueRouter.get('/audit', validateQuery(auditQuerySchema), getAuditTrail);

catalogueRouter.get('/listings/:listingId', validateParams(listingParamsSchema), getReviewListing);

catalogueRouter.post(
  '/listings/:listingId/accept',
  validateParams(listingParamsSchema),
  validateBody(acceptMatchRequestSchema),
  acceptMatch,
);

catalogueRouter.post(
  '/listings/:listingId/reject',
  validateParams(listingParamsSchema),
  validateBody(rejectMatchRequestSchema),
  rejectMatch,
);

catalogueRouter.post(
  '/listings/:listingId/reassign',
  validateParams(listingParamsSchema),
  validateBody(acceptMatchRequestSchema),
  reassignMatch,
);

catalogueRouter.post(
  '/listings/:listingId/defer',
  validateParams(listingParamsSchema),
  validateBody(deferMatchRequestSchema),
  deferMatch,
);

catalogueRouter.post(
  '/listings/:listingId/reopen',
  validateParams(listingParamsSchema),
  validateBody(reopenMatchRequestSchema),
  reopenMatch,
);

export const adminRouter: Router = Router();

adminRouter.post('/auth/login', validateBody(adminLoginRequestSchema), login);
adminRouter.get('/auth/me', requireAdmin, me);
adminRouter.use('/catalogue', catalogueRouter);
