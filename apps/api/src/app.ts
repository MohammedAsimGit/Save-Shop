import cors, { type CorsOptions } from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
// pino-http is CommonJS; the named export is the typed callable form (it also has a default).
import { pinoHttp } from 'pino-http';

import { env, isTest } from './config/env.js';
import { logger } from './config/logger.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { notFoundHandler } from './middlewares/notFoundHandler.js';
import { requestId } from './middlewares/requestId.js';
import { AppError } from './utils/AppError.js';
import { sendSuccess } from './utils/http.js';
import { createApiRouter } from './routes/index.js';

/**
 * CORS is an explicit allowlist. A missing Origin header (server-to-server,
 * curl, native mobile apps) is allowed; unknown browser origins are rejected so
 * a stray production deployment cannot be called from any website.
 */
function buildCorsOptions(): CorsOptions {
  return {
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }
      if (env.corsAllowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(
        new AppError({ statusCode: 403, code: 'FORBIDDEN', message: 'Origin not allowed by CORS' }),
      );
    },
    credentials: false,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-request-id'],
    exposedHeaders: ['x-request-id'],
    maxAge: 86_400,
  };
}

/** Builds the Express application without starting an HTTP listener. */
export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(
    helmet({
      // The API only returns JSON; the strict default CSP is kept for any future
      // error pages rendered by Express itself.
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );
  app.use(cors(buildCorsOptions()));
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));

  app.use(requestId);
  if (!isTest) {
    app.use(
      pinoHttp({
        logger,
        genReqId: (req) => (req as express.Request).requestId,
        customLogLevel: (_req, res, error) => {
          if (error || res.statusCode >= 500) return 'error';
          if (res.statusCode >= 400) return 'warn';
          return 'info';
        },
      }),
    );
  }

  // Root discovery endpoint: useful for humans, harmless in production.
  app.get('/', (_req, res) => {
    sendSuccess(res, {
      name: 'smart-shopping-api',
      version: env.SERVICE_VERSION,
      apiPrefix: env.API_PREFIX,
    });
  });

  app.use(env.API_PREFIX, createApiRouter());

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
