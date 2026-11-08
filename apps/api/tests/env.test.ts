import { describe, expect, it } from 'vitest';

import { parseEnvironment } from '../src/config/env.js';

describe('environment validation', () => {
  it('applies safe development defaults', () => {
    const env = parseEnvironment({});

    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(4000);
    expect(env.API_PREFIX).toBe('/api/v1');
    expect(env.isDatabaseConfigured).toBe(false);
    expect(env.corsAllowedOrigins.length).toBeGreaterThan(0);
  });

  it('requires MONGODB_URI in production', () => {
    expect(() => parseEnvironment({ NODE_ENV: 'production' })).toThrow(/MONGODB_URI/);
  });

  it('accepts production when a database and explicit origin are configured', () => {
    const env = parseEnvironment({
      NODE_ENV: 'production',
      MONGODB_URI: 'mongodb://127.0.0.1:27017/example',
      CORS_ALLOWED_ORIGINS: 'https://example.com',
    });

    expect(env.isDatabaseConfigured).toBe(true);
    expect(env.corsAllowedOrigins).toEqual(['https://example.com']);
  });

  it('rejects wildcard CORS origins in production', () => {
    expect(() =>
      parseEnvironment({
        NODE_ENV: 'production',
        MONGODB_URI: 'mongodb://127.0.0.1:27017/example',
        CORS_ALLOWED_ORIGINS: '*',
      }),
    ).toThrow(/[Ww]ildcard/);
  });

  it('rejects an API prefix without a leading slash', () => {
    expect(() => parseEnvironment({ API_PREFIX: 'api/v1' })).toThrow(/API_PREFIX/);
  });

  it('rejects an out-of-range port', () => {
    expect(() => parseEnvironment({ PORT: '99999' })).toThrow(/PORT/);
  });

  it('treats blank values as unset so MONGODB_URI= means "no database"', () => {
    const env = parseEnvironment({
      MONGODB_URI: '',
      CORS_ALLOWED_ORIGINS: '',
      API_PREFIX: '   ',
      PORT: '',
    });

    expect(env.isDatabaseConfigured).toBe(false);
    expect(env.PORT).toBe(4000);
    expect(env.API_PREFIX).toBe('/api/v1');
    expect(env.corsAllowedOrigins).toEqual(['http://localhost:5173']);
  });

  it('does not let a whitespace-only database URI satisfy production', () => {
    expect(() =>
      parseEnvironment({
        NODE_ENV: 'production',
        MONGODB_URI: '   ',
        CORS_ALLOWED_ORIGINS: 'https://example.com',
      }),
    ).toThrow(/MONGODB_URI/);
  });

  it('rejects a malformed origin', () => {
    expect(() => parseEnvironment({ CORS_ALLOWED_ORIGINS: 'localhost:5173' })).toThrow(
      /Invalid origin/,
    );
  });

  it('defaults demo persistence on outside production and off in it', () => {
    expect(parseEnvironment({}).persistDemoSnapshots).toBe(true);
    expect(
      parseEnvironment({
        NODE_ENV: 'production',
        MONGODB_URI: 'mongodb://127.0.0.1:27017/example',
        CORS_ALLOWED_ORIGINS: 'https://example.com',
      }).persistDemoSnapshots,
    ).toBe(false);
  });

  it('lets an explicit PERSIST_DEMO_SNAPSHOTS decide', () => {
    expect(parseEnvironment({ PERSIST_DEMO_SNAPSHOTS: 'false' }).persistDemoSnapshots).toBe(false);
    expect(
      parseEnvironment({
        NODE_ENV: 'production',
        MONGODB_URI: 'mongodb://127.0.0.1:27017/example',
        CORS_ALLOWED_ORIGINS: 'https://example.com',
        PERSIST_DEMO_SNAPSHOTS: 'true',
      }).persistDemoSnapshots,
    ).toBe(true);
  });

  it('exposes a dry-run-by-default retention policy', () => {
    const env = parseEnvironment({});

    expect(env.retention).toEqual({
      rawRetentionDays: 30,
      rollupRetentionDays: 730,
      batchSize: 500,
      dryRun: true,
    });
  });

  it('validates and parses explicit retention settings', () => {
    const env = parseEnvironment({
      RETENTION_RAW_DAYS: '30',
      RETENTION_ROLLUP_DAYS: '365',
      RETENTION_BATCH_SIZE: '50',
      RETENTION_DRY_RUN: 'false',
    });

    expect(env.retention).toEqual({
      rawRetentionDays: 30,
      rollupRetentionDays: 365,
      batchSize: 50,
      dryRun: false,
    });
  });

  it('refuses a rollup window shorter than the raw window', () => {
    expect(() =>
      parseEnvironment({ RETENTION_RAW_DAYS: '90', RETENTION_ROLLUP_DAYS: '30' }),
    ).toThrow(/RETENTION_ROLLUP_DAYS/);
  });

  it('rejects an out-of-range retention window and batch size', () => {
    expect(() => parseEnvironment({ RETENTION_RAW_DAYS: '0' })).toThrow(/RETENTION_RAW_DAYS/);
    expect(() => parseEnvironment({ RETENTION_BATCH_SIZE: '0' })).toThrow(/RETENTION_BATCH_SIZE/);
    expect(() => parseEnvironment({ RETENTION_DRY_RUN: 'yes' })).toThrow(/RETENTION_DRY_RUN/);
  });

  it('defaults the comparison cache to five minutes and validates its range', () => {
    expect(parseEnvironment({}).COMPARISON_CACHE_TTL_SECONDS).toBe(300);
    expect(
      parseEnvironment({ COMPARISON_CACHE_TTL_SECONDS: '0' }).COMPARISON_CACHE_TTL_SECONDS,
    ).toBe(0);
    expect(() => parseEnvironment({ COMPARISON_CACHE_TTL_SECONDS: '-1' })).toThrow(
      /COMPARISON_CACHE_TTL_SECONDS/,
    );
  });
});
