import type { DependencyStatus, HealthResponse } from '@smart-shopping/shared';

import { env } from '../config/env.js';
import { getDatabaseConnectionState, pingDatabase } from '../config/database.js';
import { logger } from '../config/logger.js';

/**
 * Health reporting.
 *
 * The database is only reported as "up" when a ping actually succeeded.
 * "not_configured" is used when no MONGODB_URI exists, which is a legitimate
 * development state - it is never reported as healthy.
 */

export interface HealthReport {
  readonly payload: HealthResponse;
  readonly statusCode: number;
}

const startedAt = performance.now();

async function checkDatabase(): Promise<DependencyStatus> {
  const state = getDatabaseConnectionState();

  if (!env.isDatabaseConfigured) {
    return { status: 'not_configured', message: 'MONGODB_URI is not set for this environment' };
  }

  if (state === 'connected') {
    try {
      const latencyMs = await pingDatabase();
      return { status: 'up', latencyMs };
    } catch (error) {
      logger.warn({ err: error }, 'Database ping failed');
      return { status: 'down', message: 'Ping failed' };
    }
  }

  return { status: 'down', message: `Connection state: ${state}` };
}

export async function getHealthReport(): Promise<HealthReport> {
  const database = await checkDatabase();

  // A missing database in development is a documented, expected state; only an
  // actually unreachable configured database degrades the service.
  const isDegraded = database.status === 'down';

  const payload: HealthResponse = {
    status: isDegraded ? 'degraded' : 'ok',
    service: 'smart-shopping-api',
    version: env.SERVICE_VERSION,
    environment: env.NODE_ENV,
    uptimeSeconds: Math.round((performance.now() - startedAt) / 1000),
    timestamp: new Date().toISOString(),
    checks: { database },
  };

  // 503 only when a configured dependency is unreachable, so uptime monitors and
  // load balancers see a real failure without the API ever claiming false health.
  return { payload, statusCode: isDegraded ? 503 : 200 };
}
