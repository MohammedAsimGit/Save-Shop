import { Router } from 'express';

import { adminRouter } from './admin.routes.js';
import { catalogueRouter } from './catalogue.routes.js';
import { comparisonRouter, sourcesRouter } from './comparison.routes.js';
import { healthRouter } from './health.routes.js';

/**
 * API surface for a single version.
 *
 * Future feature routers (marketplaces, wishlists, ...) are mounted here; the
 * version prefix itself is applied once in app.ts.
 */
export function createApiRouter(): Router {
  const router = Router();

  router.use('/health', healthRouter);
  // Catalogue reads are mounted first: `/products/:productId` is a single segment,
  // so the comparison and history routes below keep their own two-segment paths.
  router.use('/products', catalogueRouter);
  router.use('/products', comparisonRouter);
  router.use('/sources', sourcesRouter);
  // Administration is a separate surface: every route under /admin (except the
  // login itself) is behind the admin auth middleware.
  router.use('/admin', adminRouter);

  return router;
}
