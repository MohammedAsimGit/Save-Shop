import {
  adminLoginRequestSchema,
  adminProfileSchema,
  adminSessionResponseSchema,
  auditResponseSchema,
  listingDetailResponseSchema,
  reviewDecisionResponseSchema,
  reviewQueueResponseSchema,
  type AcceptMatchRequest,
  type AdminLoginRequest,
  type AdminProfile,
  type AdminSessionResponse,
  type AuditResponse,
  type DeferMatchRequest,
  type ListingDetailResponse,
  type RejectMatchRequest,
  type ReviewDecisionResponse,
  type ReviewQueueResponse,
} from '@smart-shopping/shared';

import { ApiError, apiRequest } from '../lib/apiClient';

/**
 * Administrator API client.
 *
 * The session token lives in `sessionStorage`, not `localStorage`: it dies with the
 * tab and is never shared between tabs. It is a bearer credential, so the frontend
 * guard is only a convenience - every request is authorised again by the API, which
 * reloads the administrator's stored role before doing anything.
 *
 * Responses are parsed against the shared contracts before a component can render
 * them. An unexpected payload is a bug, not something to display hopefully.
 */

const TOKEN_KEY = 'saveshop.admin.token';

export function readAdminToken(): string | null {
  try {
    return window.sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function clearAdminToken(): void {
  try {
    window.sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // Storage can be unavailable (private mode, disabled cookies). The API still
    // enforces authentication; the user simply has to sign in again.
  }
}

function storeAdminToken(token: string): void {
  try {
    window.sessionStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Not fatal: the in-memory session continues for this page load.
  }
}

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

function invalidResponse(message: string): ApiError {
  return new ApiError({ status: 200, code: 'INVALID_RESPONSE', message });
}

function requireToken(): string {
  const token = readAdminToken();
  if (!token) {
    throw new ApiError({
      status: 401,
      code: 'UNAUTHORIZED',
      message: 'Administrator sign-in required',
    });
  }
  return token;
}

export async function adminLogin(input: AdminLoginRequest): Promise<AdminSessionResponse> {
  const body = adminLoginRequestSchema.parse(input);
  const payload = await apiRequest<unknown>('/admin/auth/login', {
    method: 'POST',
    body,
  });

  const parsed = adminSessionResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw invalidResponse('The sign-in response did not match the agreed contract');
  }

  storeAdminToken(parsed.data.token);
  return parsed.data;
}

export async function fetchAdminProfile(): Promise<AdminProfile> {
  const token = requireToken();
  const payload = await apiRequest<unknown>('/admin/auth/me', {
    headers: authHeaders(token),
  });

  const parsed = adminProfileSchema.safeParse(payload);
  if (!parsed.success) {
    throw invalidResponse('The administrator profile did not match the agreed contract');
  }
  return parsed.data;
}

export interface AdminQueueParams {
  readonly scope?: 'pending' | 'decided' | 'all';
  readonly verdict?: string;
  readonly sourceId?: string;
  readonly marketplaceId?: string;
  readonly canonicalProductId?: string;
  readonly q?: string;
  readonly sort?: 'oldest' | 'newest' | 'confidence_asc' | 'confidence_desc';
  readonly page?: number;
  readonly pageSize?: number;
}

export async function fetchReviewQueue(
  params: AdminQueueParams,
  options: { readonly signal?: AbortSignal } = {},
): Promise<ReviewQueueResponse> {
  const token = requireToken();
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }

  const suffix = search.size > 0 ? `?${search.toString()}` : '';
  const payload = await apiRequest<unknown>(`/admin/catalogue/review-queue${suffix}`, {
    headers: authHeaders(token),
    ...(options.signal ? { signal: options.signal } : {}),
  });

  const parsed = reviewQueueResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw invalidResponse('The review queue did not match the agreed contract');
  }
  return parsed.data;
}

export async function fetchReviewListing(
  listingId: string,
  options: { readonly signal?: AbortSignal } = {},
): Promise<ListingDetailResponse> {
  const token = requireToken();
  const payload = await apiRequest<unknown>(
    `/admin/catalogue/listings/${encodeURIComponent(listingId)}`,
    {
      headers: authHeaders(token),
      ...(options.signal ? { signal: options.signal } : {}),
    },
  );

  const parsed = listingDetailResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw invalidResponse('The listing detail did not match the agreed contract');
  }
  return parsed.data;
}

export type AdminDecisionAction = 'accept' | 'reject' | 'reassign' | 'defer' | 'reopen';

export type AdminDecisionBody = AcceptMatchRequest | RejectMatchRequest | DeferMatchRequest;

export async function submitReviewDecision(
  listingId: string,
  action: AdminDecisionAction,
  body: AdminDecisionBody,
): Promise<ReviewDecisionResponse> {
  const token = requireToken();
  const payload = await apiRequest<unknown>(
    `/admin/catalogue/listings/${encodeURIComponent(listingId)}/${action}`,
    {
      method: 'POST',
      body,
      headers: authHeaders(token),
    },
  );

  const parsed = reviewDecisionResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw invalidResponse('The decision response did not match the agreed contract');
  }
  return parsed.data;
}

export interface AdminAuditParams {
  readonly action?: string;
  readonly actorId?: string;
  readonly targetId?: string;
  readonly page?: number;
  readonly pageSize?: number;
}

export async function fetchAdminAudit(
  params: AdminAuditParams,
  options: { readonly signal?: AbortSignal } = {},
): Promise<AuditResponse> {
  const token = requireToken();
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }

  const suffix = search.size > 0 ? `?${search.toString()}` : '';
  const payload = await apiRequest<unknown>(`/admin/catalogue/audit${suffix}`, {
    headers: authHeaders(token),
    ...(options.signal ? { signal: options.signal } : {}),
  });

  const parsed = auditResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw invalidResponse('The audit trail did not match the agreed contract');
  }
  return parsed.data;
}

/** True when the failure means the session is gone and the gate must be shown. */
export function isSessionExpired(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}
