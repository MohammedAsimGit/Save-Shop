import { randomUUID } from 'node:crypto';

import type { NextFunction, Request, Response } from 'express';

const ACCEPTED_INCOMING_ID = /^[A-Za-z0-9._-]{8,128}$/;

/**
 * Assigns a correlation id to every request (reusing a well-formed inbound
 * `x-request-id`) and echoes it back so a client error report can be traced
 * through the logs.
 */
export function requestId(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header('x-request-id');
  const id = incoming && ACCEPTED_INCOMING_ID.test(incoming) ? incoming : randomUUID();

  req.requestId = id;
  res.setHeader('x-request-id', id);
  next();
}
