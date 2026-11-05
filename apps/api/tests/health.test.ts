import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { healthResponseSchema } from '@smart-shopping/shared';

import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';

const app = createApp();

describe(`GET ${env.API_PREFIX}/health`, () => {
  it('returns a schema-valid health document inside the success envelope', async () => {
    const response = await request(app).get(`${env.API_PREFIX}/health`);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body).toHaveProperty('data');

    const parsed = healthResponseSchema.safeParse(response.body.data);
    expect(parsed.success).toBe(true);

    expect(response.body.data.meta).toBeUndefined();
    expect(response.body.data.service).toBe('smart-shopping-api');
    expect(response.body.data.environment).toBe('test');
  });

  it('reports a request id that can be correlated with the logs', async () => {
    const response = await request(app).get(`${env.API_PREFIX}/health`);

    expect(response.headers['x-request-id']).toMatch(/^[A-Za-z0-9._-]{8,128}$/);
  });

  it('does not claim the database is up when no database is configured', async () => {
    const response = await request(app).get(`${env.API_PREFIX}/health`);
    const databaseStatus = response.body.data.checks.database.status as string;

    if (env.isDatabaseConfigured) {
      expect(['up', 'down']).toContain(databaseStatus);
      expect(databaseStatus).not.toBe('not_configured');
    } else {
      expect(databaseStatus).toBe('not_configured');
      expect(response.body.data.status).toBe('ok');
    }
  });

  it('rejects unsupported methods on the health route', async () => {
    const response = await request(app).post(`${env.API_PREFIX}/health`).send({});

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });
});
