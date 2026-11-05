import 'express';

declare global {
  namespace Express {
    interface Request {
      /** Correlation id assigned by the requestId middleware. */
      requestId: string;
    }
  }
}
