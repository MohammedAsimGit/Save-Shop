import express, { type NextFunction, type Request, type Response } from 'express';
import { SignJWT } from 'jose';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import { createMemoryAdminStore, type AdminStore } from '../src/services/admin/adminStore.js';
import {
  createAdminAuthService,
  type AdminAuthService,
} from '../src/services/admin/auth.service.js';
import { createAdminAuthMiddleware } from '../src/middlewares/adminAuth.js';
import { verifyPassword } from '../src/services/admin/password.js';
import { signAdminToken } from '../src/services/admin/token.js';

/**
 * Administrator authentication.
 *
 * These tests exercise the real service and the real middleware; only the store is
 * in-memory. The token is signed with the same `jose` code path production uses, so
 * a test passing here means signature, issuer, audience, expiry and the account
 * reload all agreed.
 */

const SECRET = 'test-admin-session-secret-0123456789abcdef';
const PASSWORD = 'correct-horse-battery-9';
const EMAIL = 'ops@example.com';

function build(overrides: { maxAttempts?: number; windowSeconds?: number } = {}) {
  const store = createMemoryAdminStore();
  const auth = createAdminAuthService({
    store,
    secret: SECRET,
    sessionTtlSeconds: 3600,
    loginMaxAttempts: overrides.maxAttempts ?? 5,
    loginWindowSeconds: overrides.windowSeconds ?? 900,
  });
  return { store, auth };
}

async function seedAdmin(auth: AdminAuthService) {
  return auth.provision({ email: EMAIL, displayName: 'Operations', password: PASSWORD });
}

describe('administrator provisioning', () => {
  let store: AdminStore;
  let auth: AdminAuthService;

  beforeEach(() => {
    ({ store, auth } = build());
  });

  it('creates an active catalogue administrator without exposing the credential', async () => {
    const profile = await seedAdmin(auth);

    expect(profile).toMatchObject({
      email: EMAIL,
      displayName: 'Operations',
      role: 'catalogue_admin',
      status: 'active',
      lastLoginAt: null,
    });
    expect(Object.keys(profile)).not.toContain('passwordHash');

    const record = await store.findAdminByEmail(EMAIL);
    expect(record?.passwordHash).not.toBe(PASSWORD);
    expect(record?.passwordHash.startsWith('scrypt$')).toBe(true);
    expect(await verifyPassword(PASSWORD, record?.passwordHash ?? '')).toBe(true);
  });

  it('refuses a password that does not meet the policy', async () => {
    await expect(
      auth.provision({ email: EMAIL, displayName: 'Ops', password: 'short' }),
    ).rejects.toThrow(/password does not meet the policy/);

    await expect(
      auth.provision({ email: EMAIL, displayName: 'Ops', password: 'onlyletters-longenough' }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      details: expect.arrayContaining([expect.stringContaining('digit')]),
    });

    await expect(
      auth.provision({
        email: EMAIL,
        displayName: 'Ops',
        password: `contains-${EMAIL}-9`,
      }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      details: expect.arrayContaining([expect.stringContaining('email address')]),
    });

    expect(await store.listAdmins()).toHaveLength(0);
  });

  it('refuses a duplicate email regardless of case', async () => {
    await auth.provision({ email: EMAIL, displayName: 'Ops', password: PASSWORD });

    await expect(
      auth.provision({ email: 'OPS@Example.com', displayName: 'Other', password: PASSWORD }),
    ).rejects.toThrow(/already exists/);
  });

  it('starts with no administrators until one is provisioned', async () => {
    expect(await store.listAdmins()).toHaveLength(0);
    await seedAdmin(auth);
    expect(await store.listAdmins()).toHaveLength(1);
  });

  it('records provisioning in the audit trail without secrets', async () => {
    await auth.provision({ email: EMAIL, displayName: 'Ops', password: PASSWORD });

    const { events } = await store.listAudit({ page: 1, pageSize: 10 });
    expect(events.map((event) => event.action)).toEqual(['admin.provisioned']);
    expect(events[0]?.targetType).toBe('admin');
    expect(events[0]?.newState).toMatchObject({ email: EMAIL, role: 'catalogue_admin' });

    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain(PASSWORD);
    expect(serialized).not.toContain('scrypt$');
  });
});

describe('administrator login', () => {
  it('issues a verifiable session for a correct credential', async () => {
    const { auth } = build();
    await seedAdmin(auth);

    const session = await auth.login({ email: EMAIL, password: PASSWORD });

    expect(session.tokenType).toBe('Bearer');
    expect(session.admin.email).toBe(EMAIL);
    expect(new Date(session.expiresAt).getTime()).toBeGreaterThan(Date.now());

    const actor = await auth.authenticate(session.token);
    expect(actor).toMatchObject({ email: EMAIL, role: 'catalogue_admin' });
  });

  it('does not reveal whether an account exists', async () => {
    const { auth } = build();
    await seedAdmin(auth);

    const wrongPassword = await auth
      .login({ email: EMAIL, password: 'wrong-password-1' })
      .catch((error: Error) => error);
    const unknownEmail = await auth
      .login({ email: 'nobody@example.com', password: PASSWORD })
      .catch((error: Error) => error);

    expect((wrongPassword as Error).message).toBe('Invalid email or password');
    expect((unknownEmail as Error).message).toBe('Invalid email or password');
  });

  it('refuses a disabled administrator', async () => {
    const { auth } = build();
    const profile = await seedAdmin(auth);
    await auth.disable({
      adminId: profile.id,
      actor: { ...profile, role: 'catalogue_admin' },
      reason: 'left the team',
    });

    await expect(auth.login({ email: EMAIL, password: PASSWORD })).rejects.toThrow(
      /Invalid email or password/,
    );
  });

  it('throttles repeated failures before deriving another password', async () => {
    const { auth } = build({ maxAttempts: 2, windowSeconds: 60 });
    await seedAdmin(auth);

    await expect(auth.login({ email: EMAIL, password: 'wrong-password-1' })).rejects.toThrow(
      /Invalid email or password/,
    );
    await expect(auth.login({ email: EMAIL, password: 'wrong-password-2' })).rejects.toThrow(
      /Invalid email or password/,
    );
    await expect(auth.login({ email: EMAIL, password: 'wrong-password-3' })).rejects.toMatchObject({
      statusCode: 429,
      code: 'RATE_LIMITED',
    });

    auth.clearLoginThrottle();
    await expect(auth.login({ email: EMAIL, password: PASSWORD })).resolves.toMatchObject({
      tokenType: 'Bearer',
    });
  });

  it('writes a failed-attempt audit event that names no account', async () => {
    const { store, auth } = build();
    await seedAdmin(auth);

    await auth.login({ email: EMAIL, password: 'wrong-password-1' }).catch(() => undefined);

    const { events } = await store.listAudit({ page: 1, pageSize: 10 });
    const failure = events.find((event) => event.action === 'admin.login_failed');
    expect(failure).toBeDefined();
    expect(failure?.actorEmail).toBeNull();
    expect(JSON.stringify(failure)).not.toContain(PASSWORD);
  });
});

describe('session verification', () => {
  it('rejects a missing, malformed or forged token', async () => {
    const { auth } = build();
    await seedAdmin(auth);

    await expect(auth.authenticate('not-a-token')).rejects.toMatchObject({
      statusCode: 401,
    });

    const forged = await signAdminToken({
      claims: {
        adminId: 'some-id',
        email: EMAIL,
        role: 'catalogue_admin',
        tokenVersion: 0,
      },
      secret: 'a-different-secret-that-is-long-enough-000000',
      ttlSeconds: 3600,
    });
    await expect(auth.authenticate(forged.token)).rejects.toMatchObject({ statusCode: 401 });
  });

  it('rejects an expired token', async () => {
    const { auth } = build();
    await seedAdmin(auth);

    const expired = await signAdminToken({
      claims: {
        adminId: 'admin',
        email: EMAIL,
        role: 'catalogue_admin',
        tokenVersion: 0,
      },
      secret: SECRET,
      ttlSeconds: 60,
      issuedAt: new Date(Date.now() - 10 * 60_000),
    });

    await expect(auth.authenticate(expired.token)).rejects.toMatchObject({ statusCode: 401 });
  });

  it('rejects a token that is not an administrator session', async () => {
    const { auth } = build();
    await seedAdmin(auth);

    // A sign-in token for a hypothetical customer account. It is correctly signed,
    // but `verifyAdminToken` refuses any role it does not define, so an ordinary
    // user token cannot reach the admin surface.
    const customerToken = await new SignJWT({
      email: 'shopper@example.com',
      role: 'customer',
      tv: 0,
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject('customer-1')
      .setIssuer('saveshop-api')
      .setAudience('saveshop-admin')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(SECRET));

    await expect(auth.authenticate(customerToken)).rejects.toMatchObject({ statusCode: 401 });
  });

  it('revokes every session when an account is disabled', async () => {
    const { auth } = build();
    const profile = await seedAdmin(auth);
    const session = await auth.login({ email: EMAIL, password: PASSWORD });

    await auth.disable({
      adminId: profile.id,
      actor: { ...profile, role: 'catalogue_admin' },
      reason: 'left the team',
    });

    await expect(auth.authenticate(session.token)).rejects.toMatchObject({ statusCode: 401 });
  });

  it('revokes every session on password reset', async () => {
    const { auth } = build();
    const profile = await seedAdmin(auth);
    const session = await auth.login({ email: EMAIL, password: PASSWORD });

    await auth.resetPassword({
      adminId: profile.id,
      password: 'a-brand-new-password-7',
      actor: { ...profile, role: 'catalogue_admin' },
    });

    await expect(auth.authenticate(session.token)).rejects.toMatchObject({ statusCode: 401 });
    await expect(
      auth.login({ email: EMAIL, password: 'a-brand-new-password-7' }),
    ).resolves.toMatchObject({ tokenType: 'Bearer' });
  });

  it('writes an audit event for a revoked session and a password reset', async () => {
    const { store, auth } = build();
    const profile = await seedAdmin(auth);
    const session = await auth.login({ email: EMAIL, password: PASSWORD });
    await auth.disable({
      adminId: profile.id,
      actor: { ...profile, role: 'catalogue_admin' },
      reason: 'left the team',
    });

    await auth.authenticate(session.token).catch(() => undefined);

    const { events } = await store.listAudit({ page: 1, pageSize: 20 });
    expect(events.map((event) => event.action)).toEqual(
      expect.arrayContaining([
        'admin.provisioned',
        'admin.login',
        'admin.disabled',
        'admin.forbidden',
      ]),
    );
    expect(JSON.stringify(events)).not.toContain(PASSWORD);
    expect(JSON.stringify(events)).not.toContain(session.token);
  });
});

describe('admin route protection', () => {
  function protectedApp(auth: AdminAuthService) {
    const app = express();
    app.use(express.json());
    app.get('/api/v1/admin/protected', createAdminAuthMiddleware(auth), (req, res) => {
      res.json({ data: { email: req.admin?.email } });
    });
    // Mirrors the production error handler closely enough to assert on envelopes.
    app.use(
      (
        error: { statusCode?: number; code?: string; message?: string },
        _req: Request,
        res: Response,
        _next: NextFunction,
      ) => {
        res.status(error.statusCode ?? 500).json({
          error: { code: error.code ?? 'INTERNAL_ERROR', message: error.message },
        });
      },
    );
    return app;
  }

  it('refuses an unauthenticated request', async () => {
    const { auth } = build();
    const response = await request(protectedApp(auth)).get('/api/v1/admin/protected');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('refuses a non-bearer authorization header', async () => {
    const { auth } = build();
    await seedAdmin(auth);

    const response = await request(protectedApp(auth))
      .get('/api/v1/admin/protected')
      .set('Authorization', 'Basic dXNlcjpwYXNz');

    expect(response.status).toBe(401);
  });

  it('allows a provisioned administrator through', async () => {
    const { auth } = build();
    await seedAdmin(auth);
    const session = await auth.login({ email: EMAIL, password: PASSWORD });

    const response = await request(protectedApp(auth))
      .get('/api/v1/admin/protected')
      .set('Authorization', `Bearer ${session.token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.email).toBe(EMAIL);
  });

  it('refuses a disabled administrator with a previously valid token', async () => {
    const { auth } = build();
    const profile = await seedAdmin(auth);
    const session = await auth.login({ email: EMAIL, password: PASSWORD });
    await auth.disable({
      adminId: profile.id,
      actor: { ...profile, role: 'catalogue_admin' },
      reason: 'disabled during test',
    });

    const response = await request(protectedApp(auth))
      .get('/api/v1/admin/protected')
      .set('Authorization', `Bearer ${session.token}`);

    expect(response.status).toBe(401);
  });
});
