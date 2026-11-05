/**
 * Transport-level API contracts shared by the API, web and mobile clients.
 *
 * These describe the HTTP envelope and error codes only. Feature payload
 * schemas are added in the sprint that implements the feature.
 */

/** Every successful JSON response is wrapped in this envelope. */
export interface SuccessEnvelope<T> {
  readonly data: T;
  readonly meta?: ResponseMeta;
}

export interface ResponseMeta {
  readonly requestId?: string;
  /** Present on paginated collections only. */
  readonly page?: number;
  readonly pageSize?: number;
  readonly totalItems?: number;
}

/** Every error response is wrapped in this envelope. */
export interface ErrorEnvelope {
  readonly error: {
    readonly code: ApiErrorCode;
    readonly message: string;
    /** Field-level validation details; safe to display. */
    readonly details?: readonly FieldError[] | readonly string[];
    readonly requestId?: string;
  };
}

export interface FieldError {
  readonly field: string;
  readonly message: string;
}

/**
 * Stable, machine-readable error codes. Clients should branch on `code`,
 * never on the human-readable `message`.
 */
export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'RATE_LIMITED'
  | 'SERVICE_UNAVAILABLE'
  | 'INTERNAL_ERROR';

export function isErrorEnvelope(value: unknown): value is ErrorEnvelope {
  if (typeof value !== 'object' || value === null || !('error' in value)) return false;
  const { error } = value as { error: unknown };
  return typeof error === 'object' && error !== null && 'code' in error && 'message' in error;
}
