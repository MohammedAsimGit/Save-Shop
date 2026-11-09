import { isErrorEnvelope, type ApiErrorCode, type SuccessEnvelope } from '@smart-shopping/shared';

import { webEnv } from './env';

/**
 * The single place the web app talks to the backend.
 *
 * The browser never talks to MongoDB or a marketplace: everything goes through
 * this client and the REST API. Errors are normalised into `ApiError` so UI
 * code never has to read raw response bodies.
 */

const DEFAULT_TIMEOUT_MS = 8_000;

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode | 'NETWORK_ERROR' | 'INVALID_RESPONSE';
  readonly details?: readonly string[];
  readonly requestId?: string;

  constructor(options: {
    status: number;
    code: ApiError['code'];
    message: string;
    details?: readonly string[];
    requestId?: string;
  }) {
    super(options.message);
    this.name = 'ApiError';
    this.status = options.status;
    this.code = options.code;
    if (options.details) this.details = options.details;
    if (options.requestId) this.requestId = options.requestId;
  }

  /** True when the API could not be reached at all (offline, not started, DNS). */
  get isNetworkError(): boolean {
    return this.code === 'NETWORK_ERROR';
  }
}

export interface ApiRequestOptions {
  readonly method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  readonly body?: unknown;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
  /** Extra headers, e.g. `Authorization` for the administrator API. */
  readonly headers?: Readonly<Record<string, string>>;
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const url = `${webEnv.apiBaseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const signal = options.signal ? AbortSignal.any([options.signal, timeoutSignal]) : timeoutSignal;

  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? 'GET',
      headers: {
        Accept: 'application/json',
        ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...options.headers,
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      signal,
    });
  } catch {
    throw new ApiError({
      status: 0,
      code: 'NETWORK_ERROR',
      message: 'Could not reach the API. Is the backend running?',
    });
  }

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    if (isErrorEnvelope(payload)) {
      throw new ApiError({
        status: response.status,
        code: payload.error.code,
        message: payload.error.message,
        ...(Array.isArray(payload.error.details) && payload.error.details.length > 0
          ? { details: payload.error.details as readonly string[] }
          : {}),
        ...(payload.error.requestId ? { requestId: payload.error.requestId } : {}),
      });
    }
    throw new ApiError({
      status: response.status,
      code: 'INVALID_RESPONSE',
      message: `Request failed with status ${response.status}`,
    });
  }

  if (typeof payload !== 'object' || payload === null || !('data' in payload)) {
    throw new ApiError({
      status: response.status,
      code: 'INVALID_RESPONSE',
      message: 'The API returned an unexpected response shape',
    });
  }

  return (payload as SuccessEnvelope<T>).data;
}
