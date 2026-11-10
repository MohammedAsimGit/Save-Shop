import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    /**
     * Replica-set tests are a separate, slower suite with their own command
     * (`npm run test:integration:merge`). Keeping them out of `npm test` means the
     * default suite never depends on a transactional MongoDB deployment.
     */
    exclude: [...configDefaults.exclude, 'tests/integration/**'],
    // Tests must not depend on whatever is exported in the developer's shell.
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      PORT: '4000',
      CORS_ALLOWED_ORIGINS: 'http://localhost:5173,http://127.0.0.1:5173',
    },
    // The API is stateless in Sprint 0; running files serially avoids surprises
    // once MongoDB-backed tests arrive.
    fileParallelism: false,
    clearMocks: true,
  },
});
