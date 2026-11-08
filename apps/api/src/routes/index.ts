import { Router } from 'express';

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

  return router;
}
