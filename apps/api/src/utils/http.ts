import type { Response } from 'express';
import type {
  ApiErrorCode,
  ErrorEnvelope,
  ResponseMeta,
  SuccessEnvelope,
} from '@smart-shopping/shared';

/** Writes a successful JSON response using the shared success envelope. */
export function sendSuccess<T>(
  res: Response,
  data: T,
  statusCode = 200,
  meta?: ResponseMeta,
): void {
  const body: SuccessEnvelope<T> = meta ? { data, meta } : { data };
  res.status(statusCode).json(body);
}

/** Writes an error JSON response using the shared error envelope. */
export function sendError(
  res: Response,
  statusCode: number,
  error: {
    code: ApiErrorCode;
    message: string;
    details?: readonly string[];
    requestId?: string;
  },
): void {
  const body: ErrorEnvelope = { error };
  res.status(statusCode).json(body);
}
