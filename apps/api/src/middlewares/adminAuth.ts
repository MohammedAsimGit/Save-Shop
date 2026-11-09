import type { NextFunction, Request, Response } from 'express';

import { AppError } from '../utils/AppError.js';
import type { AdminActor, AdminAuthService } from '../services/admin/auth.service.js';

/**
 * Administrator authentication middleware.
 *
 * This is the only place the admin surface decides whether a request is allowed in.
 * It verifies the bearer token's signature and expiry, then reloads the account:
 * a token alone is never enough, because the role and status that authorise an
 * action live in the database and can change while a token is still valid.
 *
 * The role is read from the verified account, never from a header, body or query
 * parameter, so a client cannot promote itself by sending `role=catalogue_admin`.
 */

const MAX_TOKEN_LENGTH = 4096;

function unauthorized(): AppError {
  return new AppError({
    statusCode: 401,
    code: 'UNAUTHORIZED',
    message: 'A valid administrator session is required',
  });
}

function bearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return null;
  const token = (match[1] ?? '').trim();
  if (token.length === 0 || token.length > MAX_TOKEN_LENGTH) return null;
  return token;
}

export function createAdminAuthMiddleware(auth: AdminAuthService) {
  return async function requireAdmin(
    req: Request,
    _res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const token = bearerToken(req.header('authorization'));
      if (!token) {
        next(unauthorized());
        return;
      }

      const actor = await auth.authenticate(token, req.requestId);
      req.admin = actor;
      next();
    } catch (error) {
      next(error);
    }
  };
}

/** Narrowing helper so controllers never cast a possibly-absent actor. */
export function requireActor(req: Request): AdminActor {
  if (!req.admin) {
    throw new AppError({
      statusCode: 401,
      code: 'UNAUTHORIZED',
      message: 'A valid administrator session is required',
    });
  }
  return req.admin;
}
