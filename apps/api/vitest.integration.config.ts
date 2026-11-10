import { defineConfig } from 'vitest/config';

/**
 * Real MongoDB replica-set suite.
 *
 * Separate from `vitest.config.ts` on purpose: these tests require a transactional
 * MongoDB (a MongoDB replica set) and must never be silently skipped inside the
 * default suite. Run them with `npm run test:integration:merge`.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      PORT: '4000',
      CORS_ALLOWED_ORIGINS: 'http://localhost:5173,http://127.0.0.1:5173',
    },
    // A replica set has startup cost, and each file owns one; serial execution also
    // keeps transaction timing deterministic.
    fileParallelism: false,
    clearMocks: true,
    // Starting the in-memory replica set (and downloading mongod on a cold cache)
    // can take a while on the first run.
    testTimeout: 60_000,
    hookTimeout: 240_000,
  },
});
