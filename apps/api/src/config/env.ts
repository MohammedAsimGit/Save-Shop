import path from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';
import { z } from 'zod';

/**
 * Environment configuration.
 *
 * Rules enforced here:
 * - Nothing in this file is ever imported by frontend code.
 * - The process fails fast with a readable message instead of booting with
 *   half-configured settings.
 * - No default silently invents an external dependency.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
/** apps/api (src/config -> ../..) - keeps .env resolution independent of the cwd. */
const apiRoot = path.resolve(here, '..', '..');

dotenv.config({ path: path.join(apiRoot, '.env'), quiet: true });

const logLevels = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

const rawEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  API_PREFIX: z
    .string()
    .regex(
      /^\/[a-zA-Z0-9/-]*$/,
      'API_PREFIX must start with "/" and contain no query or trailing slash',
    )
    .default('/api/v1'),
  /** Optional in all environments, required in production (checked below). */
  MONGODB_URI: z.string().trim().min(1).optional(),
  CORS_ALLOWED_ORIGINS: z.string().default('http://localhost:5173'),
  LOG_LEVEL: z.enum(logLevels).default('info'),
  SERVICE_VERSION: z.string().default('0.1.0'),
});

const envSchema = rawEnvSchema.superRefine((value, ctx) => {
  if (value.NODE_ENV === 'production' && !value.MONGODB_URI) {
    ctx.addIssue({
      code: 'custom',
      path: ['MONGODB_URI'],
      message: 'MONGODB_URI is required when NODE_ENV=production',
    });
  }

  const origins = value.CORS_ALLOWED_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  if (origins.length === 0) {
    ctx.addIssue({
      code: 'custom',
      path: ['CORS_ALLOWED_ORIGINS'],
      message: 'At least one allowed origin is required',
    });
  }

  if (value.NODE_ENV === 'production' && origins.includes('*')) {
    ctx.addIssue({
      code: 'custom',
      path: ['CORS_ALLOWED_ORIGINS'],
      message: 'Wildcard CORS origins are not permitted in production',
    });
  }

  for (const origin of origins) {
    if (!/^https?:\/\/[^/\s]+$/.test(origin)) {
      ctx.addIssue({
        code: 'custom',
        path: ['CORS_ALLOWED_ORIGINS'],
        message: `Invalid origin "${origin}" - expected scheme://host[:port] with no trailing slash`,
      });
    }
  }
});

export type Environment = z.infer<typeof rawEnvSchema> & {
  readonly corsAllowedOrigins: readonly string[];
  /** True when MONGODB_URI is absent: the API runs without a database (dev only). */
  readonly isDatabaseConfigured: boolean;
};

/**
 * Treats blank values as absent.
 *
 * `MONGODB_URI=` (the documented way to say "no database") is an empty string,
 * not `undefined`, so without this it would fail `.min(1)` and stop the process.
 * Compose files, CI runners and shells do the same thing with `VAR=""`.
 * Normalising once here keeps the schema itself strict.
 */
function withoutBlankValues(source: NodeJS.ProcessEnv): Record<string, string | undefined> {
  const normalized: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(source)) {
    normalized[key] = typeof value === 'string' && value.trim() === '' ? undefined : value;
  }
  return normalized;
}

/**
 * Validates an arbitrary environment map. Exported so the failure modes are
 * testable without mutating the running process.
 */
export function parseEnvironment(source: NodeJS.ProcessEnv): Environment {
  const result = envSchema.safeParse(withoutBlankValues(source));

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    // Deliberately thrown (not process.exit) so tests can assert on it.
    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  const value = result.data;
  const corsAllowedOrigins = value.CORS_ALLOWED_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  return Object.freeze({
    ...value,
    corsAllowedOrigins,
    isDatabaseConfigured: Boolean(value.MONGODB_URI),
  });
}

export const env: Environment = parseEnvironment(process.env);

export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
export const isDevelopment = env.NODE_ENV === 'development';
