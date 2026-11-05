import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';

const app = createApp();

describe('error contract', () => {
  it('returns the shared error envelope for unknown routes', async () => {
    const response = await request(app).get('/does-not-exist');

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
    expect(typeof response.body.error.message).toBe('string');
    expect(response.body.error.requestId).toBe(response.headers['x-request-id']);
  });

  it('echoes a well-formed inbound request id', async () => {
    const response = await request(app)
      .get(`${env.API_PREFIX}/health`)
      .set('x-request-id', 'client-correlation-1234');

    expect(response.headers['x-request-id']).toBe('client-correlation-1234');
  });

  it('replaces a malformed inbound request id', async () => {
    const response = await request(app)
      .get(`${env.API_PREFIX}/health`)
      .set('x-request-id', 'bad id!');

    expect(response.headers['x-request-id']).not.toBe('bad id!');
    expect(response.headers['x-request-id']).toMatch(/^[A-Za-z0-9._-]{8,128}$/);
  });

  it('rejects malformed JSON bodies with a validation error envelope', async () => {
    const response = await request(app)
      .post('/anywhere')
      .set('content-type', 'application/json')
      .send('{"broken": ');

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(typeof response.body.error.code).toBe('string');
  });
});

describe('CORS', () => {
  it('allows a configured origin', async () => {
    const allowedOrigin = env.corsAllowedOrigins[0];
    expect(allowedOrigin).toBeDefined();

    const response = await request(app)
      .get(`${env.API_PREFIX}/health`)
      .set('origin', allowedOrigin as string);

    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe(allowedOrigin);
  });

  it('rejects an origin that is not on the allowlist', async () => {
    const response = await request(app)
      .get(`${env.API_PREFIX}/health`)
      .set('origin', 'https://not-allowed.example');

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('allows requests without an origin (server-to-server, curl, native apps)', async () => {
    const response = await request(app).get(`${env.API_PREFIX}/health`);
    expect(response.status).toBe(200);
  });
});

describe('security headers', () => {
  it('does not advertise the framework and sets helmet defaults', async () => {
    const response = await request(app).get('/');

    expect(response.headers['x-powered-by']).toBeUndefined();
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    // helmet sets HSTS by default; browsers ignore it on plain http (local dev),
    // and honour it once the API is served over TLS in production.
    expect(response.headers['strict-transport-security']).toContain('max-age=');
  });
});
