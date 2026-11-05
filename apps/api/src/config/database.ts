import mongoose from 'mongoose';

import { env } from './env.js';
import { logger } from './logger.js';

/**
 * MongoDB connection lifecycle.
 *
 * Sprint 0 connects and reports status; no schemas or repositories exist yet.
 * Failures are logged and surfaced through the health endpoint rather than
 * being swallowed - and the API never claims the database is healthy without
 * checking the connection state.
 */

export type DatabaseConnectionState =
  'connected' | 'connecting' | 'disconnected' | 'disconnecting' | 'uninitialized';

const stateMap: Record<number, DatabaseConnectionState> = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
  99: 'uninitialized',
};

export function getDatabaseConnectionState(): DatabaseConnectionState {
  return stateMap[mongoose.connection.readyState] ?? 'uninitialized';
}

let listenersAttached = false;

function attachConnectionListeners(): void {
  if (listenersAttached) return;
  listenersAttached = true;

  mongoose.connection.on('connected', () => logger.info('MongoDB connected'));
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
  mongoose.connection.on('reconnected', () => logger.info('MongoDB reconnected'));
  mongoose.connection.on('error', (error: unknown) => {
    logger.error({ err: error }, 'MongoDB connection error');
  });
}

/**
 * Connects to MongoDB when MONGODB_URI is configured.
 * Returns false when no URI is configured (development convenience) so callers
 * can decide how noisy to be.
 */
export async function connectDatabase(): Promise<boolean> {
  if (!env.MONGODB_URI) {
    logger.warn(
      'MONGODB_URI is not set - starting without a database. Health will report "not_configured".',
    );
    return false;
  }

  attachConnectionListeners();

  mongoose.set('strictQuery', true);
  await mongoose.connect(env.MONGODB_URI, {
    // Bounded so a wrong host fails fast instead of hanging the boot.
    serverSelectionTimeoutMS: 5_000,
    maxPoolSize: 10,
  });

  return true;
}

export async function disconnectDatabase(): Promise<void> {
  if (mongoose.connection.readyState === 0) return;
  await mongoose.disconnect();
}

/** Round-trip ping used by the health check. Only safe to call while connected. */
export async function pingDatabase(): Promise<number> {
  const startedAt = performance.now();
  await mongoose.connection.db?.admin().ping();
  return Math.round(performance.now() - startedAt);
}
