import type { Request, Response } from 'express';

import { getHealthReport } from '../services/health.service.js';
import { sendSuccess } from '../utils/http.js';

/**
 * GET {API_PREFIX}/health
 * Reports process health plus a real dependency check.
 */
export async function getHealth(_req: Request, res: Response): Promise<void> {
  const { payload, statusCode } = await getHealthReport();
  sendSuccess(res, payload, statusCode);
}
