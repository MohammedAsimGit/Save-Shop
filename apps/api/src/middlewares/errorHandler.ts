import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

import { AppError } from '../utils/AppError.js';
import { sendError } from '../utils/http.js';
import { isProduction } from '../config/env.js';
import { logger } from '../config/logger.js';

/** Converts a Zod validation error into client-safe field messages. */
export function formatZodIssues(error: ZodError): string[] {
  return error.issues.map((issue) => {
    const field = issue.path.length > 0 ? issue.path.join('.') : '(body)';
    return `${field}: ${issue.message}`;
  });
}

/**
 * Terminal error middleware. Must keep all four parameters so Express
 * recognises it as an error handler.
 *
 * Rules:
 * - Expected failures (AppError, ZodError) return their real status and code.
 * - Everything else becomes a generic 500 in production; stack traces and
 *   driver messages never reach the client.
 */
export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (res.headersSent) {
    logger.error({ err: error, requestId: req.requestId }, 'Error after response was sent');
    return;
  }

  if (error instanceof ZodError) {
    sendError(res, 400, {
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      details: formatZodIssues(error),
      requestId: req.requestId,
    });
    return;
  }

  if (error instanceof AppError) {
    if (error.statusCode >= 500) {
      logger.error({ err: error, requestId: req.requestId }, error.message);
    } else {
      logger.warn({ requestId: req.requestId, statusCode: error.statusCode }, error.message);
    }

    sendError(res, error.statusCode, {
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
      requestId: req.requestId,
    });
    return;
  }

  logger.error({ err: error, requestId: req.requestId }, 'Unhandled error');

  sendError(res, 500, {
    code: 'INTERNAL_ERROR',
    message: isProduction ? 'An unexpected error occurred' : describeUnexpected(error),
    requestId: req.requestId,
  });
}

/** Development-only detail so local debugging is not blind; never used in production. */
function describeUnexpected(error: unknown): string {
  if (error instanceof Error) return `Unexpected error: ${error.message}`;
  return 'An unexpected error occurred';
}
