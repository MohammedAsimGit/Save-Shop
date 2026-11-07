import type { NextFunction, Request, Response } from 'express';
import type { ZodType } from 'zod';

/** Replaces the raw params with the parsed result so handlers only see valid ids. */
export function validateParams<T extends Record<string, string>>(schema: ZodType<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      next(result.error);
      return;
    }
    req.params = result.data;
    next();
  };
}

/**
 * Request validation.
 *
 * Handlers never trust raw input: body and params are parsed at the boundary and
 * replaced with the typed result. Zod failures go to the central error handler,
 * which turns them into a 400 VALIDATION_ERROR with field-level details.
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
