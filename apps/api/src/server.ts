import type { Server } from 'node:http';

import { createApp } from './app.js';
import { env, isProduction } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { logger } from './config/logger.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

let server: Server | undefined;
let shuttingDown = false;

async function start(): Promise<void> {
  // A missing database is fatal in production and a warning in development.
  try {
    const connected = await connectDatabase();
    if (!connected && isProduction) {
      throw new Error('MONGODB_URI is required in production');
    }
  } catch (error) {
    logger.fatal({ err: error }, 'Unable to connect to MongoDB');
    process.exitCode = 1;
    return;
  }

  const app = createApp();

  server = app.listen(env.PORT, () => {
    logger.info(
      { port: env.PORT, environment: env.NODE_ENV, apiPrefix: env.API_PREFIX },
      `API listening on http://localhost:${env.PORT}${env.API_PREFIX}`,
    );
  });

  server.on('error', (error: unknown) => {
    logger.fatal({ err: error }, 'HTTP server error');
    process.exitCode = 1;
  });
}

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Shutting down');

  // Never hang forever on a stuck connection.
  const forceExit = setTimeout(() => {
    logger.error('Graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();

  try {
    await new Promise<void>((resolve, reject) => {
      if (!server) {
        resolve();
        return;
      }
      server.close((error) => (error ? reject(error) : resolve()));
    });
    await disconnectDatabase();
    logger.info('Shutdown complete');
    clearTimeout(forceExit);
    process.exit(0);
  } catch (error) {
    logger.error({ err: error }, 'Error during shutdown');
    clearTimeout(forceExit);
    process.exit(1);
  }
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void shutdown(signal);
  });
}

process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Unhandled promise rejection');
});

process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'Uncaught exception - exiting');
  process.exit(1);
});

void start();
