import 'express';

declare global {
  namespace Express {
    interface Request {
      /** Correlation id assigned by the requestId middleware. */
      requestId: string;
      /**
       * The authenticated administrator, set only by the admin auth middleware from a
       * verified token plus a live account lookup. Absent on every public route.
       *
       * Declared structurally rather than by importing the service type: a global
       * augmentation must not depend on a module that itself imports Express.
       */
      admin?: {
        readonly id: string;
        readonly email: string;
        readonly displayName: string;
        readonly role: 'catalogue_admin';
      };
    }
  }
}
