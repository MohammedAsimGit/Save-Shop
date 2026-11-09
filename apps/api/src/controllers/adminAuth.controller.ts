import type { Request, Response } from 'express';

import type { AdminLoginRequest } from '@smart-shopping/shared';

import { requireActor } from '../middlewares/adminAuth.js';
import { adminAuthService } from '../services/admin/index.js';
import { sendSuccess } from '../utils/http.js';

/**
 * POST {API_PREFIX}/admin/auth/login
 *
 * The only public endpoint on the admin surface. The body is already validated
 * against `adminLoginRequestSchema`; failures are indistinguishable between an
 * unknown email, a wrong password and a disabled account.
 */
export async function login(req: Request, res: Response): Promise<void> {
  const body = req.body as AdminLoginRequest;
  const session = await adminAuthService.login({ ...body, requestId: req.requestId });

  // The token is a credential: the response is never cacheable.
  res.setHeader('Cache-Control', 'no-store');
  sendSuccess(res, session);
}

/**
 * GET {API_PREFIX}/admin/auth/me
 *
 * Returns the signed-in administrator's profile. Reaching this handler already
 * proves the token verified and the account is active; the profile is re-read so
 * a display-name change is reflected without a new token.
 */
export async function me(req: Request, res: Response): Promise<void> {
  const actor = requireActor(req);
  const profile = await adminAuthService.profile(actor.id);
  res.setHeader('Cache-Control', 'no-store');
  sendSuccess(res, profile);
}
