import type { NextFunction, Request, Response } from 'express';

import { AppError } from '../utils/AppError.js';

/** Forwards unmatched routes to the central error handler as a 404. */
export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(AppError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}
