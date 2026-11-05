import { Router } from 'express';

import { healthRouter } from './health.routes.js';

/**
 * API surface for a single version.
 *
 * Future feature routers (products, marketplaces, wishlists, ...) are mounted
 * here; the version prefix itself is applied once in app.ts.
 */
export function createApiRouter(): Router {
  const router = Router();

  router.use('/health', healthRouter);

  return router;
}
