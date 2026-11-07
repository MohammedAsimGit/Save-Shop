import { z } from 'zod';

import {
  freshnessSchema,
  httpUrlSchema,
  isoDateTimeSchema,
  marketSourceSchema,
  moneySchema,
  offerAvailabilitySchema,
} from './comparison.js';
import { comparedProductSchema } from './comparison.js';

/**
 * Price history contract.
 *
 * History is a record of what a source actually reported, not a reconstructed
 * trend. Two rules are encoded here rather than left to the UI:
 *
 * 1. Every observation keeps its source, verification state and capture time, so
 *    a sample point can never be rendered as a marketplace price.
 * 2. Summaries are computed **per provenance**. Demo data and verified data are
 *    never aggregated into one "lowest ever" figure, because that number would be
 *    a claim no source supports.
 */

/** Windows the API accepts. Short lists keep the contract closed and testable. */
export const historyPeriodSchema = z.enum(['7d', '30d', '90d']);
export type HistoryPeriod = z.infer<typeof historyPeriodSchema>;

export const HISTORY_PERIOD_DAYS: Readonly<Record<HistoryPeriod, number>> = Object.freeze({
  '7d': 7,
  '30d': 30,
  '90d': 90,
});

export const DEFAULT_HISTORY_PERIOD: HistoryPeriod = '30d';
export const HISTORY_MAX_OBSERVATIONS = 500;

/**
 * Query contract for `GET /products/:productId/history`.
 *
 * `period` is an enum rather than a free-form day count so the database query and
 * the cache key stay bounded. `sourceId`/`marketplaceId` are optional filters; a
 * client can never widen the result beyond the product it asked for.
 */
export const priceHistoryQuerySchema = z.object({
  period: historyPeriodSchema.default(DEFAULT_HISTORY_PERIOD),
  sourceId: z.string().trim().min(1).max(80).optional(),
  marketplaceId: z.string().trim().min(1).max(80).optional(),
  limit: z.coerce.number().int().min(1).max(HISTORY_MAX_OBSERVATIONS).default(200),
});

export type PriceHistoryQuery = z.infer<typeof priceHistoryQuerySchema>;

/** One stored observation, joined with the source that reported it. */
export const historyObservationSchema = z.object({
  productId: z.string().min(1).max(120),
  marketplaceId: z.string().min(1).max(80),
  sourceId: z.string().min(1).max(80),
  productUrl: httpUrlSchema,
  price: moneySchema,
  availability: offerAvailabilitySchema,
  /** When the price was observed, not when it was stored. */
  capturedAt: isoDateTimeSchema,
  ttlSeconds: z.number().int().min(30).max(604_800),
  attribution: z.object({
    label: z.string().min(1).max(160),
    url: httpUrlSchema.optional(),
  }),
  source: marketSourceSchema,
  /** True when the reporting source is sample data. Derived, never client-supplied. */
  isSample: z.boolean(),
  /**
   * Whether this observation is still inside its own TTL *now*. History keeps
   * stale observations on purpose; the flag prevents one being shown as current.
   */
  freshness: freshnessSchema,
});

export type HistoryObservation = z.infer<typeof historyObservationSchema>;

/** A single extreme (lowest or latest) inside one provenance group. */
export const historyPricePointSchema = z.object({
  price: moneySchema,
  capturedAt: isoDateTimeSchema,
  marketplaceId: z.string().min(1).max(80),
  sourceId: z.string().min(1).max(80),
});

export type HistoryPricePoint = z.infer<typeof historyPricePointSchema>;

export const historyGroupSummarySchema = z.object({
  count: z.number().int().min(0),
  lowest: historyPricePointSchema.nullable(),
  latest: historyPricePointSchema.nullable(),
});

export type HistoryGroupSummary = z.infer<typeof historyGroupSummarySchema>;

/**
 * Sample and verified history are summarised separately and never merged.
 * `sample_only` therefore cannot produce a "verified lowest price" by accident.
 */
export const historySummarySchema = z.object({
  verified: historyGroupSummarySchema,
  sample: historyGroupSummarySchema,
});

export type HistorySummary = z.infer<typeof historySummarySchema>;

export const historyStatusSchema = z.enum(['no_history', 'sample_only', 'verified', 'mixed']);
export type HistoryStatus = z.infer<typeof historyStatusSchema>;

/** GET {API_PREFIX}/products/:productId/history */
export const priceHistoryResponseSchema = z.object({
  productId: z.string().min(1),
  product: comparedProductSchema,
  currency: z.string().regex(/^[A-Z]{3}$/),
  period: historyPeriodSchema,
  /** Inclusive window the query ran over. */
  from: isoDateTimeSchema,
  to: isoDateTimeSchema,
  generatedAt: isoDateTimeSchema,
  status: historyStatusSchema,
  /** Chronological, oldest first. Every point is a real stored observation. */
  observations: z.array(historyObservationSchema),
  summary: historySummarySchema,
  /** Echo of the filters, so a client can show what was asked for. */
  filters: z.object({
    sourceId: z.string().nullable(),
    marketplaceId: z.string().nullable(),
    limit: z.number().int().min(1),
  }),
  notices: z.array(z.string().max(300)),
});

export type PriceHistoryResponse = z.infer<typeof priceHistoryResponseSchema>;
