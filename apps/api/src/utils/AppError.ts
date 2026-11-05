import type { ApiErrorCode } from '@smart-shopping/shared';

/**
 * Operational (expected) error the API can translate into a safe HTTP response.
 * Anything else that is thrown is treated as an unexpected failure and its
 * details are never sent to the client.
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: ApiErrorCode;
  readonly details?: readonly string[];
  readonly isOperational = true;

  constructor(options: {
    statusCode: number;
    code: ApiErrorCode;
    message: string;
    details?: readonly string[];
  }) {
    super(options.message);
    this.name = 'AppError';
    this.statusCode = options.statusCode;
    this.code = options.code;
    if (options.details) this.details = options.details;
    Error.captureStackTrace?.(this, AppError);
  }

  static notFound(message = 'Resource not found'): AppError {
    return new AppError({ statusCode: 404, code: 'NOT_FOUND', message });
  }

  static validation(message = 'Request validation failed', details?: readonly string[]): AppError {
    return new AppError({ statusCode: 400, code: 'VALIDATION_ERROR', message, details });
  }
}
