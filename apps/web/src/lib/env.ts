import { z } from 'zod';

/**
 * Web runtime configuration.
 *
 * Only `VITE_*` values are available here and every one of them is public -
 * they end up in the browser bundle, so secrets must never be added.
 */

const isHttpUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

const envSchema = z.object({
  VITE_API_BASE_URL: z
    .string()
    .trim()
    .refine(isHttpUrl, 'VITE_API_BASE_URL must be an absolute http(s) URL')
    .transform((value) => value.replace(/\/+$/, '')),
});

const developmentFallback = 'http://localhost:4000/api/v1';

function resolveApiBaseUrl(): string {
  const raw = import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? developmentFallback : '');
  const parsed = envSchema.safeParse({ VITE_API_BASE_URL: raw });

  if (!parsed.success) {
    throw new Error(
      `Invalid web configuration: ${parsed.error.issues.map((issue) => issue.message).join('; ')}`,
    );
  }

  return parsed.data.VITE_API_BASE_URL;
}

export const webEnv = Object.freeze({
  apiBaseUrl: resolveApiBaseUrl(),
  isProduction: import.meta.env.PROD,
});
