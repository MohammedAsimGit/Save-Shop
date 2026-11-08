import type { Request, Response } from 'express';

import type { CatalogueSearchQuery } from '@smart-shopping/shared';

import { catalogueService } from '../services/catalogue/index.js';
import { validatedQuery } from '../middlewares/validate.js';
import { sendSuccess } from '../utils/http.js';

/**
 * Canonical catalogue endpoints.
 *
 * These handlers only read already-validated input and delegate to the catalogue
 * service. An unknown product is a 404; an empty result set is a 200 with an
 * honest empty page, because "nothing matched" is information.
 */

/** GET {API_PREFIX}/products */
export async function searchProducts(_req: Request, res: Response): Promise<void> {
  const query = validatedQuery<CatalogueSearchQuery>(res);
  const result = await catalogueService.search(query);

  sendSuccess(res, result, 200, {
    page: result.page,
    pageSize: result.pageSize,
    totalItems: result.totalItems,
  });
}

/** GET {API_PREFIX}/products/:productId */
export async function getProduct(req: Request, res: Response): Promise<void> {
  const { productId } = req.params as { productId: string };
  const result = await catalogueService.getProduct(productId);
  sendSuccess(res, result);
}

/** GET {API_PREFIX}/products/:productId/listings */
export async function getProductListings(req: Request, res: Response): Promise<void> {
  const { productId } = req.params as { productId: string };
  const result = await catalogueService.getListings(productId);
  sendSuccess(res, result);
}
