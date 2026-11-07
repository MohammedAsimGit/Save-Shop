import type { NextFunction, Request, Response } from 'express';
import type { ZodType } from 'zod';

/**
 * Validated query strings.
 *
 * Express 5 exposes `req.query` as a getter, so the parsed value is stored on
 * `res.locals` instead of being written back. Controllers read it through
 * `validatedQuery<T>(res)`, which keeps the cast in one place.
 */
export function validateQuery<T>(schema: ZodType<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      next(result.error);
      return;
    }
    res.locals['validatedQuery'] = result.data;
    next();
  };
}

/** Reads the parsed query produced by `validateQuery`. */
export function validatedQuery<T>(res: Response): T {
  return res.locals['validatedQuery'] as T;
}

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
