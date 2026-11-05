import type { NextFunction, Request, Response } from 'express';
import type { ZodType } from 'zod';

/**
 * Request validation foundation.
 *
 * No feature routes use it yet; it exists so Sprint 1+ handlers parse input at
 * the boundary instead of trusting the request. Parsed output replaces the raw
 * body, so controllers only ever see validated data.
 *
 * Throwing a ZodError is intentional: the central error handler turns it into a
 * 400 VALIDATION_ERROR response.
 */
export function validateBody<T>(schema: ZodType<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      next(result.error);
      return;
    }
    req.body = result.data;
    next();
  };
}
