import { isErrorEnvelope, type ApiErrorCode, type SuccessEnvelope } from '@smart-shopping/shared';

import { mobileEnv } from '../config/env';

/**
 * The only network entry point for the mobile app.
 *
 * Uses fetch (available in React Native/Hermes) plus an explicit
 * AbortController timeout, because `AbortSignal.timeout` is not guaranteed on
 * every Hermes version the app may run on.
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

  get isNetworkError(): boolean {
    return this.code === 'NETWORK_ERROR';
  }
}

export interface ApiRequestOptions {
  readonly method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  readonly body?: unknown;
  readonly timeoutMs?: number;
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const url = `${mobileEnv.apiBaseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: options.method ?? 'GET',
      headers: {
        Accept: 'application/json',
        ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      signal: controller.signal,
    });

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
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError({
      status: 0,
      code: 'NETWORK_ERROR',
      message: `Could not reach the API at ${mobileEnv.apiBaseUrl}`,
    });
  } finally {
    clearTimeout(timeout);
  }
}
