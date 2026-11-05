import { describe, expect, it } from 'vitest';

import { healthResponseSchema } from './health.js';

const validPayload = {
  status: 'ok',
  service: 'smart-shopping-api',
  version: '0.1.0',
  environment: 'test',
  uptimeSeconds: 12,
  timestamp: '2026-01-01T00:00:00.000Z',
  checks: {
    database: { status: 'not_configured' },
  },
};

describe('healthResponseSchema', () => {
  it('accepts a documented payload', () => {
    expect(healthResponseSchema.safeParse(validPayload).success).toBe(true);
  });

  it('requires a database check with an explicit status', () => {
    const withoutChecks = { ...validPayload, checks: {} };
    expect(healthResponseSchema.safeParse(withoutChecks).success).toBe(false);
  });

  it('rejects an invented "healthy" status for the database', () => {
    const invented = {
      ...validPayload,
      checks: { database: { status: 'healthy' } },
    };
    expect(healthResponseSchema.safeParse(invented).success).toBe(false);
  });
});
