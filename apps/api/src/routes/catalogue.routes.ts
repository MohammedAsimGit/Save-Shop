import { Router } from 'express';
import { z } from 'zod';

import { catalogueProductIdSchema, catalogueSearchQuerySchema } from '@smart-shopping/shared';

import {
  getProduct,
  getProductListings,
  searchProducts,
} from '../controllers/catalogue.controller.js';
import { validateParams, validateQuery } from '../middlewares/validate.js';

/**
 * Canonical catalogue API.
 *
 * There is deliberately **no** ingestion endpoint: the project has no admin
 * authentication yet, and an unauthenticated write endpoint that creates product
 * identity would be a security hole. Catalogue ingestion runs through the local
 * CLI (`npm run catalogue -- ingest …`), which is documented as the limitation it
 * is. Read endpoints are public, like the rest of the catalogue surface.
 */

const productParamsSchema = z.object({ productId: catalogueProductIdSchema });

export const catalogueRouter: Router = Router();

catalogueRouter.get('/', validateQuery(catalogueSearchQuerySchema), searchProducts);

catalogueRouter.get('/:productId', validateParams(productParamsSchema), getProduct);

catalogueRouter.get(
  '/:productId/listings',
  validateParams(productParamsSchema),
  getProductListings,
);
