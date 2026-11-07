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
