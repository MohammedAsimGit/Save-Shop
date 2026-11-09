import type { Request, Response } from 'express';

import type {
  AcceptMatchRequest,
  AuditQuery,
  DeferMatchRequest,
  MergePreviewQuery,
  MergeRequest,
  RejectMatchRequest,
  ReopenMatchRequest,
  ReviewQueueQuery,
} from '@smart-shopping/shared';

import { requireActor } from '../middlewares/adminAuth.js';
import { validatedQuery } from '../middlewares/validate.js';
import { adminStore, mergeService, reviewService } from '../services/admin/index.js';
import { sendSuccess } from '../utils/http.js';

/** Shared response policy: admin payloads are per-user and must never be cached. */
function noStore(res: Response): void {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Vary', 'Authorization');
}

/** GET {API_PREFIX}/admin/catalogue/review-queue */
export async function getReviewQueue(req: Request, res: Response): Promise<void> {
  const query = validatedQuery<ReviewQueueQuery>(res);
  const queue = await reviewService.getQueue(query);
  noStore(res);
  res.setHeader('x-request-id', req.requestId);
  sendSuccess(res, queue, 200, {
    requestId: req.requestId,
    page: queue.page,
    pageSize: queue.pageSize,
    totalItems: queue.totalItems,
  });
}

/** GET {API_PREFIX}/admin/catalogue/listings/:listingId */
export async function getReviewListing(req: Request, res: Response): Promise<void> {
  const { listingId } = req.params as { listingId: string };
  const detail = await reviewService.getListing(listingId);
  noStore(res);
  sendSuccess(res, detail);
}

/** POST {API_PREFIX}/admin/catalogue/listings/:listingId/accept */
export async function acceptMatch(req: Request, res: Response): Promise<void> {
  const { listingId } = req.params as { listingId: string };
  const body = req.body as AcceptMatchRequest;
  const result = await reviewService.decide({
    listingId,
    action: 'accept',
    actor: requireActor(req),
    requestId: req.requestId,
    body,
  });
  noStore(res);
  sendSuccess(res, result);
}

/** POST {API_PREFIX}/admin/catalogue/listings/:listingId/reject */
export async function rejectMatch(req: Request, res: Response): Promise<void> {
  const { listingId } = req.params as { listingId: string };
  const body = req.body as RejectMatchRequest;
  const result = await reviewService.decide({
    listingId,
    action: 'reject',
    actor: requireActor(req),
    requestId: req.requestId,
    body,
  });
  noStore(res);
  sendSuccess(res, result);
}

/** POST {API_PREFIX}/admin/catalogue/listings/:listingId/reassign */
export async function reassignMatch(req: Request, res: Response): Promise<void> {
  const { listingId } = req.params as { listingId: string };
  const body = req.body as AcceptMatchRequest;
  const result = await reviewService.decide({
    listingId,
    action: 'reassign',
    actor: requireActor(req),
    requestId: req.requestId,
    body,
  });
  noStore(res);
  sendSuccess(res, result);
}

/** POST {API_PREFIX}/admin/catalogue/listings/:listingId/defer */
export async function deferMatch(req: Request, res: Response): Promise<void> {
  const { listingId } = req.params as { listingId: string };
  const body = req.body as DeferMatchRequest;
  const result = await reviewService.decide({
    listingId,
    action: 'defer',
    actor: requireActor(req),
    requestId: req.requestId,
    body,
  });
  noStore(res);
  sendSuccess(res, result);
}

/** POST {API_PREFIX}/admin/catalogue/listings/:listingId/reopen */
export async function reopenMatch(req: Request, res: Response): Promise<void> {
  const { listingId } = req.params as { listingId: string };
  const body = req.body as ReopenMatchRequest;
  const result = await reviewService.decide({
    listingId,
    action: 'reopen',
    actor: requireActor(req),
    requestId: req.requestId,
    body,
  });
  noStore(res);
  sendSuccess(res, result);
}

/** GET {API_PREFIX}/admin/catalogue/merge-preview */
export async function getMergePreview(_req: Request, res: Response): Promise<void> {
  const query = validatedQuery<MergePreviewQuery>(res);
  const preview = await mergeService.preview(query);
  noStore(res);
  sendSuccess(res, preview);
}

/** POST {API_PREFIX}/admin/catalogue/products/merge */
export async function mergeProducts(req: Request, res: Response): Promise<void> {
  const body = req.body as MergeRequest;
  const result = await mergeService.merge({
    ...body,
    actor: requireActor(req),
    requestId: req.requestId,
  });
  noStore(res);
  sendSuccess(res, result);
}

/** GET {API_PREFIX}/admin/catalogue/audit */
export async function getAuditTrail(_req: Request, res: Response): Promise<void> {
  const query = validatedQuery<AuditQuery>(res);
  const page = await adminStore.listAudit(query);
  noStore(res);
  sendSuccess(
    res,
    {
      events: page.events,
      page: query.page,
      pageSize: query.pageSize,
      totalItems: page.totalItems,
    },
    200,
    { page: query.page, pageSize: query.pageSize, totalItems: page.totalItems },
  );
}
