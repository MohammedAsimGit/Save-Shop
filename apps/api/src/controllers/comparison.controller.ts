import type { Request, Response } from 'express';

import { comparisonService } from '../services/comparison.service.js';
import { sendSuccess } from '../utils/http.js';

/**
 * GET {API_PREFIX}/products/:productId/comparison
 *
 * Ranked offers for one product. Validation happens in middleware, so the id is
 * already known-good here; an unknown product becomes a 404 via AppError.
 */
export async function getProductComparison(req: Request, res: Response): Promise<void> {
  const { productId } = req.params as { productId: string };
  const comparison = await comparisonService.getComparison(productId);
  sendSuccess(res, comparison);
}

/**
 * GET {API_PREFIX}/sources
 *
 * Which price sources exist, which are enabled, and why the rest are not.
 */
export function getSourceCoverage(_req: Request, res: Response): void {
  sendSuccess(res, comparisonService.getCoverage());
}
