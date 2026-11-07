import { Router } from 'express';
import { z } from 'zod';

import { priceHistoryQuerySchema } from '@smart-shopping/shared';

import { getProductComparison, getSourceCoverage } from '../controllers/comparison.controller.js';
import { getProductHistory } from '../controllers/history.controller.js';
import { validateParams, validateQuery } from '../middlewares/validate.js';

/**
 * Product ids are catalogue slugs. Constraining the shape here keeps malformed
 * ids out of the service layer and gives the client a field-level 400 instead of
 * a 404 that hides a typo.
 */
const productParamsSchema = z.object({
  productId: z
    .string()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9][a-z0-9-]*$/, 'must be a lowercase slug'),
});

export const comparisonRouter: Router = Router();

comparisonRouter.get(
  '/:productId/comparison',
  validateParams(productParamsSchema),
  getProductComparison,
);

comparisonRouter.get(
  '/:productId/history',
  validateParams(productParamsSchema),
  validateQuery(priceHistoryQuerySchema),
  getProductHistory,
);

export const sourcesRouter: Router = Router();

sourcesRouter.get('/', getSourceCoverage);
