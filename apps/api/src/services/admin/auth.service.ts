import { randomUUID } from 'node:crypto';

import type { AdminLoginRequest, AdminProfile, AdminSessionResponse } from '@smart-shopping/shared';

import { AppError } from '../../utils/AppError.js';

/**
 * Administrator authentication and authorization service.
 *
 * The rules this service exists to enforce:
 * - an account is created only through explicit provisioning (the CLI), never by a
 *   default seed and never with a hardcoded password;
 * - a token is proof of a *session*, not of current authority: every request
 *   reloads the account, so disabling an administrator or resetting a password
 *   takes effect on the next request rather than when the token expires;
 * - role and status come from the database, never from a request body or a token
 *   claim the client could have been handed by an outdated build;
 * - a failed login is indistinguishable from an unknown account, and repeated
 *   failures are throttled per email per process.
 */

import type { AdminStore, AdminUserRecord } from './adminStore.js';
import { recordAudit } from './audit.js';
import {
  DUMMY_PASSWORD_HASH,
  checkPasswordPolicy,
  hashPassword,
  verifyPassword,
} from './password.js';
import { signAdminToken, verifyAdminToken } from './token.js';

export interface AdminActor {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly role: AdminUserRecord['role'];
}

export interface AdminAuthService {
  readonly store: AdminStore;
  provision(input: {
    readonly email: string;
    readonly displayName: string;
    readonly password: string;
    readonly actor?: AdminActor | null;
    readonly requestId?: string | null;
  }): Promise<AdminProfile>;
  login(
    input: AdminLoginRequest & { readonly requestId?: string | null },
  ): Promise<AdminSessionResponse>;
  /** Verifies a bearer token and returns the current, live account behind it. */
  authenticate(token: string, requestId?: string | null): Promise<AdminActor>;
  /** Credential-free profile for the signed-in administrator. */
  profile(adminId: string): Promise<AdminProfile>;
  listAdmins(): Promise<AdminProfile[]>;
  disable(input: {
    readonly adminId: string;
    readonly actor: AdminActor;
    readonly reason: string;
    readonly requestId?: string | null;
  }): Promise<AdminProfile>;
  resetPassword(input: {
    readonly adminId: string;
    readonly password: string;
    readonly actor: AdminActor;
    readonly requestId?: string | null;
  }): Promise<AdminProfile>;
  /** Test/maintenance helper: clears the in-process login throttle. */
  clearLoginThrottle(): void;
}

export interface AdminAuthOptions {
  readonly store: AdminStore;
  readonly secret: string;
  readonly sessionTtlSeconds: number;
  readonly loginMaxAttempts: number;
  readonly loginWindowSeconds: number;
  readonly now?: () => Date;
}

interface ThrottleEntry {
  failures: number;
  windowEndsAt: number;
}

function toProfile(record: AdminUserRecord): AdminProfile {
  return {
    id: record.id,
    email: record.email,
    displayName: record.displayName,
    role: record.role,
    status: record.status,
    createdAt: record.createdAt.toISOString(),
    lastLoginAt: record.lastLoginAt ? record.lastLoginAt.toISOString() : null,
  };
}

export function createAdminAuthService(options: AdminAuthOptions): AdminAuthService {
  const { store } = options;
  const clock = options.now ?? (() => new Date());
  const throttle = new Map<string, ThrottleEntry>();
  const windowMs = options.loginWindowSeconds * 1000;

  // Only the fields authorisation needs. Never the hash, never the token version.
  function publicState(record: AdminUserRecord): Record<string, unknown> {
    return {
      id: record.id,
      email: record.email,
      role: record.role,
      status: record.status,
    };
  }

  async function requireAdminRecord(adminId: string): Promise<AdminUserRecord> {
    const record = await store.findAdminById(adminId);
    if (!record) throw AppError.notFound(`Unknown administrator: ${adminId}`);
    return record;
  }

  return {
    store,

    clearLoginThrottle() {
      throttle.clear();
    },

    async provision(input) {
      const email = input.email.trim().toLowerCase();
      const displayName = input.displayName.trim();

      const policy = checkPasswordPolicy(input.password, email);
      if (!policy.valid) {
        throw AppError.validation(
          'Administrator password does not meet the policy',
          policy.problems,
        );
      }

      const existing = await store.findAdminByEmail(email);
      if (existing) {
        throw new AppError({
          statusCode: 409,
          code: 'CONFLICT',
          message: `An administrator with ${email} already exists`,
        });
      }

      const now = clock();
      const record: AdminUserRecord = {
        id: randomUUID(),
        email,
        displayName,
        role: 'catalogue_admin',
        status: 'active',
        passwordHash: await hashPassword(input.password),
        tokenVersion: 0,
        lastLoginAt: null,
        passwordUpdatedAt: now,
        createdAt: now,
        updatedAt: now,
      };

      const { created } = await store.createAdmin(record);
      if (!created) {
        throw new AppError({
          statusCode: 409,
          code: 'CONFLICT',
          message: `An administrator with ${email} already exists`,
        });
      }

      await recordAudit(
        store,
        {
          action: 'admin.provisioned',
          actorId: input.actor?.id ?? null,
          actorEmail: input.actor?.email ?? null,
          targetType: 'admin',
          targetId: record.id,
          previousState: {},
          newState: publicState(record),
          reason: 'administrator provisioned',
          requestId: input.requestId ?? null,
        },
        now,
      );

      return toProfile(record);
    },

    async login(input) {
      const email = input.email.trim().toLowerCase();
      const now = clock();

      const entry = throttle.get(email);
      if (
        entry &&
        entry.failures >= options.loginMaxAttempts &&
        now.getTime() < entry.windowEndsAt
      ) {
        // Throttled attempts are refused before the password is even derived, so a
        // brute-force run costs the attacker a round trip and us nothing.
        throw new AppError({
          statusCode: 429,
          code: 'RATE_LIMITED',
          message: 'Too many failed sign-in attempts. Try again later.',
        });
      }

      const record = await store.findAdminByEmail(email);
      // Unknown account and disabled account both verify against a real hash, so
      // timing and error text do not reveal which one it was.
      const hash = record?.passwordHash ?? DUMMY_PASSWORD_HASH;
      const passwordOk = await verifyPassword(input.password, hash);

      if (!record || !passwordOk || record.status !== 'active') {
        const current = throttle.get(email);
        const failures =
          (current && current.windowEndsAt > now.getTime() ? current.failures : 0) + 1;
        throttle.set(email, { failures, windowEndsAt: now.getTime() + windowMs });

        await recordAudit(
          store,
          {
            action: 'admin.login_failed',
            actorId: record?.id ?? null,
            actorEmail: null,
            targetType: 'admin',
            targetId: record?.id ?? null,
            // Reason is a fixed string: it must not say whether the email exists.
            previousState: {},
            newState: { outcome: 'rejected' },
            reason: 'sign-in failed',
            requestId: input.requestId ?? null,
          },
          now,
        );

        throw new AppError({
          statusCode: 401,
          code: 'UNAUTHORIZED',
          message: 'Invalid email or password',
        });
      }

      throttle.delete(email);

      const updated = (await store.updateAdmin(record.id, { lastLoginAt: now })) ?? record;

      const { token, expiresAt } = await signAdminToken({
        claims: {
          adminId: record.id,
          email: record.email,
          role: record.role,
          tokenVersion: record.tokenVersion,
        },
        secret: options.secret,
        ttlSeconds: options.sessionTtlSeconds,
        issuedAt: now,
      });

      await recordAudit(
        store,
        {
          action: 'admin.login',
          actorId: record.id,
          actorEmail: record.email,
          targetType: 'admin',
          targetId: record.id,
          previousState: {},
          newState: { lastLoginAt: now.toISOString() },
          reason: 'administrator signed in',
          requestId: input.requestId ?? null,
        },
        now,
      );

      return {
        token,
        tokenType: 'Bearer',
        expiresAt: expiresAt.toISOString(),
        admin: toProfile(updated),
      };
    },

    async authenticate(token, requestId) {
      const claims = await verifyAdminToken(token, options.secret);
      if (!claims) {
        throw new AppError({
          statusCode: 401,
          code: 'UNAUTHORIZED',
          message: 'A valid administrator session is required',
        });
      }

      const record = await store.findAdminById(claims.adminId);

      // A token for an account that no longer exists, was disabled, or whose
      // credential was reset is not authority. Everything is re-read here on
      // purpose: the token only says who claimed the session.
      const stillAuthorised =
        record !== null &&
        record.status === 'active' &&
        record.tokenVersion === claims.tokenVersion &&
        record.role === claims.role;

      if (!stillAuthorised) {
        await recordAudit(
          store,
          {
            action: 'admin.forbidden',
            actorId: record?.id ?? claims.adminId,
            actorEmail: record?.email ?? null,
            targetType: 'session',
            targetId: record?.id ?? claims.adminId,
            previousState: {},
            newState: { outcome: 'rejected', reason: 'session no longer authorised' },
            reason: 'stale or revoked admin session',
            requestId: requestId ?? null,
          },
          clock(),
        );
        throw new AppError({
          statusCode: 401,
          code: 'UNAUTHORIZED',
          message: 'A valid administrator session is required',
        });
      }

      return {
        id: record.id,
        email: record.email,
        displayName: record.displayName,
        role: record.role,
      };
    },

    async profile(adminId) {
      return toProfile(await requireAdminRecord(adminId));
    },

    async listAdmins() {
      const records = await store.listAdmins();
      return records.map(toProfile);
    },

    async disable(input) {
      const record = await requireAdminRecord(input.adminId);
      const now = clock();

      const updated =
        (await store.updateAdmin(record.id, {
          status: 'disabled',
          tokenVersion: record.tokenVersion + 1,
        })) ?? record;

      await recordAudit(
        store,
        {
          action: 'admin.disabled',
          actorId: input.actor.id,
          actorEmail: input.actor.email,
          targetType: 'admin',
          targetId: record.id,
          previousState: publicState(record),
          newState: publicState(updated),
          reason: input.reason,
          requestId: input.requestId ?? null,
        },
        now,
      );

      return toProfile(updated);
    },

    async resetPassword(input) {
      const record = await requireAdminRecord(input.adminId);
      const policy = checkPasswordPolicy(input.password, record.email);
      if (!policy.valid) {
        throw AppError.validation(
          'Administrator password does not meet the policy',
          policy.problems,
        );
      }

      const now = clock();
      const updated =
        (await store.updateAdmin(record.id, {
          passwordHash: await hashPassword(input.password),
          passwordUpdatedAt: now,
          // Resetting a credential ends every existing session.
          tokenVersion: record.tokenVersion + 1,
        })) ?? record;

      await recordAudit(
        store,
        {
          action: 'admin.password_reset',
          actorId: input.actor.id,
          actorEmail: input.actor.email,
          targetType: 'admin',
          targetId: record.id,
          // The hash is never recorded, not even a prefix of it.
          previousState: { id: record.id, status: record.status },
          newState: {
            id: updated.id,
            status: updated.status,
            passwordUpdatedAt: now.toISOString(),
          },
          reason: 'administrator password reset',
          requestId: input.requestId ?? null,
        },
        now,
      );

      return toProfile(updated);
    },
  };
}
