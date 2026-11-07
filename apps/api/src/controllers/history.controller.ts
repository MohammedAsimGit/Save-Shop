import type { Request, Response } from 'express';

import type { PriceHistoryQuery } from '@smart-shopping/shared';

import { validatedQuery } from '../middlewares/validate.js';
import { historyService } from '../services/history.service.js';
import { sendSuccess } from '../utils/http.js';

/**
 * GET {API_PREFIX}/products/:productId/history?period=30d&sourceId=&marketplaceId=&limit=
 *
 * Params and query are validated by middleware, so this handler only reads
 * already-parsed values. An unknown product is a 404; a known product with no
 * stored observations is a 200 with `status: "no_history"` and an empty list -
 * absence of history is information, not an error.
 */
export async function getProductHistory(req: Request, res: Response): Promise<void> {
  const { productId } = req.params as { productId: string };
  const query = validatedQuery<PriceHistoryQuery>(res);

  const history = await historyService.getHistory(productId, query);
  sendSuccess(res, history);
}
