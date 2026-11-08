import { z } from 'zod';

import { isoDateTimeSchema, marketSourceSchema, moneySchema } from './comparison.js';

/**
 * Daily price rollups (Sprint 4).
 *
 * A rollup summarises one **day** of stored observations for a single
 * (product, source, marketplace, currency, provenance) group. It is a
 * compression of facts that were genuinely observed - it never estimates a price
 * and it never interpolates a missing day.
 *
 * `aggregated: true` is a literal rather than a boolean: the type system and the
 * validator both refuse to let an aggregate pass as a point-in-time price.
 */

export const rollupDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be a UTC calendar date (YYYY-MM-DD)');

export const rollupAvailabilitySchema = z.object({
  inStock: z.number().int().min(0),
  outOfStock: z.number().int().min(0),
  preorder: z.number().int().min(0),
  unknown: z.number().int().min(0),
});

export type RollupAvailability = z.infer<typeof rollupAvailabilitySchema>;

/** One archived day for one source/marketplace/provenance group. */
export const dailyRollupSchema = z.object({
  productId: z.string().min(1).max(120),
  sourceId: z.string().min(1).max(80),
  marketplaceId: z.string().min(1).max(80),
  currency: z.string().regex(/^[A-Z]{3}$/),
  /** UTC calendar date the observations fell on. */
  date: rollupDateSchema,
  minPrice: moneySchema,
  maxPrice: moneySchema,
  firstPrice: moneySchema,
  lastPrice: moneySchema,
  observationCount: z.number().int().min(1),
  availabilityCounts: rollupAvailabilitySchema,
  sourceVerification: z.enum(['verified', 'sample']),
  isSample: z.boolean(),
  generatedAt: isoDateTimeSchema,
  /** Always true: this is an aggregate, never a point-in-time price. */
  aggregated: z.literal(true),
});

export type DailyRollup = z.infer<typeof dailyRollupSchema>;

/**
 * A rollup as returned inside a history response: the stored aggregate joined
 * with the source identity the client needs to label it.
 */
export const historyRollupSchema = dailyRollupSchema.extend({
  source: marketSourceSchema,
});

export type HistoryRollup = z.infer<typeof historyRollupSchema>;

/** Upper bound on rollups returned by a single history response. */
export const HISTORY_MAX_ROLLUP_DAYS = 120;
