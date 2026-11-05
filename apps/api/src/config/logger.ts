import pino from 'pino';

import { env, isDevelopment, isTest } from './env.js';

/**
 * Application logger.
 *
 * - Structured JSON in production (machine parseable, no pretty printing cost).
 * - Human-readable output in development through pino-pretty.
 * - Silent during tests unless LOG_LEVEL is set explicitly.
 * - Redaction is configured so future auth headers/tokens never reach the logs.
 */
export const logger = pino({
  level: isTest && process.env.LOG_LEVEL === undefined ? 'silent' : env.LOG_LEVEL,
  base: { service: 'smart-shopping-api', environment: env.NODE_ENV },
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
    remove: true,
  },
  transport: isDevelopment
    ? {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname,service' },
      }
    : undefined,
});
