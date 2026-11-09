import { SignJWT, jwtVerify, type JWTPayload } from 'jose';

import type { AdminRole } from '@smart-shopping/shared';

/**
 * Administrator session tokens.
 *
 * `jose` implements JWS/JWT (HS256) rather than this project hand-rolling token
 * parsing or signatures. The claims carry only what authorisation needs: the admin
 * id, the role, and a token version that a disable or password reset bumps. The
 * middleware still reloads the account, so a token is never the last word on
 * whether someone is still an administrator.
 */

const ISSUER = 'saveshop-api';
const AUDIENCE = 'saveshop-admin';
const ALGORITHM = 'HS256';

export interface AdminTokenClaims {
  readonly adminId: string;
  readonly email: string;
  readonly role: AdminRole;
  readonly tokenVersion: number;
}

function keyOf(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function signAdminToken(options: {
  readonly claims: AdminTokenClaims;
  readonly secret: string;
  readonly ttlSeconds: number;
  readonly issuedAt?: Date;
}): Promise<{ token: string; expiresAt: Date }> {
  const issuedAt = options.issuedAt ?? new Date();
  const expiresAt = new Date(issuedAt.getTime() + options.ttlSeconds * 1000);

  const token = await new SignJWT({
    email: options.claims.email,
    role: options.claims.role,
    tv: options.claims.tokenVersion,
  })
    .setProtectedHeader({ alg: ALGORITHM, typ: 'JWT' })
    .setSubject(options.claims.adminId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(Math.floor(issuedAt.getTime() / 1000))
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(keyOf(options.secret));

  return { token, expiresAt };
}

/**
 * Verifies signature, issuer, audience and expiry. Returns null for anything that
 * does not verify: callers must not distinguish "expired" from "forged" in a
 * response.
 */
export async function verifyAdminToken(
  token: string,
  secret: string,
): Promise<AdminTokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, keyOf(secret), {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: [ALGORITHM],
    });
    return claimsFromPayload(payload);
  } catch {
    return null;
  }
}

function claimsFromPayload(payload: JWTPayload): AdminTokenClaims | null {
  const { sub, email, role, tv } = payload;
  if (typeof sub !== 'string' || sub.length === 0 || sub.length > 60) return null;
  if (typeof email !== 'string' || email.length === 0 || email.length > 200) return null;
  if (role !== 'catalogue_admin') return null;
  if (typeof tv !== 'number' || !Number.isInteger(tv) || tv < 0) return null;

  return { adminId: sub, email, role, tokenVersion: tv };
}
