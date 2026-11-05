import { z } from 'zod';

/**
 * Health-check contract (GET {API_PREFIX}/health).
 *
 * The endpoint may only claim a dependency is healthy when that dependency was
 * actually checked, which is why "not_configured" is a distinct state and why
 * every check carries its own status.
 */

export const dependencyStatusSchema = z.object({
  /** "up" = checked and reachable, "down" = checked and unreachable, "not_configured" = no client configured. */
  status: z.enum(['up', 'down', 'not_configured']),
  latencyMs: z.number().nonnegative().optional(),
  /** Safe, non-sensitive diagnostic such as an error class name. */
  message: z.string().optional(),
});

export const healthResponseSchema = z.object({
  /** "ok" = everything checked is up; "degraded" = serving but a dependency is unavailable. */
  status: z.enum(['ok', 'degraded', 'error']),
  service: z.string(),
  version: z.string(),
  environment: z.enum(['development', 'test', 'production']),
  uptimeSeconds: z.number().nonnegative(),
  timestamp: z.string(),
  checks: z.object({
    database: dependencyStatusSchema,
  }),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type DependencyStatus = z.infer<typeof dependencyStatusSchema>;
