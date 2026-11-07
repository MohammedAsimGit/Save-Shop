import {
  HISTORY_PERIOD_DAYS,
  demoProducts,
  offerSnapshotSchema,
  type HistoryGroupSummary,
  type HistoryObservation,
  type HistoryPricePoint,
  type HistoryStatus,
  type MarketSource,
  type PriceHistoryQuery,
  type PriceHistoryResponse,
} from '@smart-shopping/shared';

import { logger } from '../config/logger.js';
import { AppError } from '../utils/AppError.js';
import { snapshotStore as sharedSnapshotStore } from './snapshots/index.js';
import type { SnapshotStore, StoredSnapshot } from './snapshots/snapshotStore.js';
import { createSourceRegistry } from './sources/registry.js';

/**
 * Price history service.
 *
 * Reads persisted observations and reports exactly what was stored. It never
 * interpolates, smooths, back-fills or "completes" a series: a product with one
 * stored observation returns one observation, because a line drawn through two
 * invented endpoints would be a fabricated trend.
 *
 * Sample and verified history are summarised separately (`summary.sample` /
 * `summary.verified`) and never merged into one "lowest ever" number. A demo
 * price can therefore never stand in for a verified marketplace price.
 */

/** History is reported in the same currency comparisons are ranked in. */
const HISTORY_CURRENCY = 'INR';

/** Product identity is still catalogue-owned until a catalogue source exists. */
const CATALOG_ID = 'demo-catalog';

export interface HistoryServiceOptions {
  readonly store?: SnapshotStore;
  readonly sources?: readonly MarketSource[];
  readonly now?: () => Date;
}

export interface HistoryService {
  getHistory(productId: string, query: PriceHistoryQuery): Promise<PriceHistoryResponse>;
}

function emptyGroup(): HistoryGroupSummary {
  return { count: 0, lowest: null, latest: null };
}

function toPricePoint(observation: HistoryObservation): HistoryPricePoint {
  return {
    price: observation.price,
    capturedAt: observation.capturedAt,
    marketplaceId: observation.marketplaceId,
    sourceId: observation.sourceId,
  };
}

function summarise(observations: readonly HistoryObservation[]): HistoryGroupSummary {
  if (observations.length === 0) return emptyGroup();

  let lowest = observations[0];
  let latest = observations[0];

  for (const observation of observations) {
    if (!lowest || observation.price.amountMinor < lowest.price.amountMinor) lowest = observation;
    if (!latest || Date.parse(observation.capturedAt) >= Date.parse(latest.capturedAt)) {
      latest = observation;
    }
  }

  return {
    count: observations.length,
    lowest: lowest ? toPricePoint(lowest) : null,
    latest: latest ? toPricePoint(latest) : null,
  };
}

function toObservation(
  stored: StoredSnapshot,
  source: MarketSource,
  now: Date,
): HistoryObservation {
  const snapshot = stored.snapshot;
  const expiresMs = Date.parse(snapshot.capturedAt) + snapshot.ttlSeconds * 1000;

  return {
    productId: snapshot.productId,
    marketplaceId: snapshot.marketplaceId,
    sourceId: snapshot.sourceId,
    productUrl: snapshot.productUrl,
    price: snapshot.price,
    availability: snapshot.availability,
    capturedAt: snapshot.capturedAt,
    ttlSeconds: snapshot.ttlSeconds,
    attribution: snapshot.attribution,
    source,
    isSample: source.verification === 'sample',
    freshness: expiresMs > now.getTime() ? 'fresh' : 'stale',
  };
}

export function createHistoryService(options: HistoryServiceOptions = {}): HistoryService {
  const store = options.store ?? sharedSnapshotStore;
  const clock = options.now ?? (() => new Date());
  const sources = options.sources ?? createSourceRegistry().sources;
  const sourcesById = new Map(sources.map((source) => [source.id, source]));

  return {
    async getHistory(productId: string, query: PriceHistoryQuery): Promise<PriceHistoryResponse> {
      const product = demoProducts.find((entry) => entry.id === productId);
      if (!product) {
        throw AppError.notFound(`Unknown product: ${productId}`);
      }

      const now = clock();
      const to = now;
      const from = new Date(now.getTime() - HISTORY_PERIOD_DAYS[query.period] * 86_400_000);

      const stored = await store.listHistory({
        productId,
        from,
        to,
        ...(query.sourceId ? { sourceId: query.sourceId } : {}),
        ...(query.marketplaceId ? { marketplaceId: query.marketplaceId } : {}),
        limit: query.limit,
      });

      const observations: HistoryObservation[] = [];
      const notices: string[] = [];
      let invalid = 0;
      let unknownSource = 0;
      let otherCurrency = 0;

      for (const entry of stored) {
        const parsed = offerSnapshotSchema.safeParse(entry.snapshot);
        if (!parsed.success) {
          invalid += 1;
          continue;
        }

        const source = sourcesById.get(entry.snapshot.sourceId);
        if (!source) {
          unknownSource += 1;
          continue;
        }

        if (entry.snapshot.price.currency !== HISTORY_CURRENCY) {
          otherCurrency += 1;
          continue;
        }

        observations.push(toObservation(entry, source, now));
      }

      observations.sort((a, b) => {
        const diff = Date.parse(a.capturedAt) - Date.parse(b.capturedAt);
        if (diff !== 0) return diff;
        return `${a.marketplaceId}:${a.sourceId}`.localeCompare(`${b.marketplaceId}:${b.sourceId}`);
      });

      const verified = observations.filter((observation) => !observation.isSample);
      const sample = observations.filter((observation) => observation.isSample);

      const status: HistoryStatus =
        observations.length === 0
          ? 'no_history'
          : verified.length > 0 && sample.length > 0
            ? 'mixed'
            : verified.length > 0
              ? 'verified'
              : 'sample_only';

      if (observations.length === 0) {
        notices.push(
          `No stored observation for this product in the last ${HISTORY_PERIOD_DAYS[query.period]} days.`,
        );
      } else {
        notices.push(
          `History covers ${observations.length} stored observation${observations.length === 1 ? '' : 's'} from ${from.toISOString().slice(0, 10)} to ${to.toISOString().slice(0, 10)}.`,
        );
      }

      if (sample.length > 0) {
        notices.push(
          'Sample observations are invented demo prices, not marketplace history, and are summarised separately from verified observations.',
        );
      }

      if (status === 'mixed') {
        notices.push(
          'Verified and demo observations are kept apart: demo points are never used to describe a marketplace trend.',
        );
      }

      if (sample.length > 0 && verified.length === 0) {
        notices.push('No verified source has stored a price for this product yet.');
      }

      if (observations.length === query.limit) {
        notices.push(`Showing the most recent ${query.limit} observations in this window.`);
      }

      if (invalid > 0) {
        notices.push(
          `${invalid} stored observation${invalid === 1 ? ' was' : 's were'} excluded as invalid.`,
        );
      }
      if (unknownSource > 0) {
        logger.warn(
          { productId, unknownSource },
          'History excluded observations from an unregistered source',
        );
        notices.push(
          `${unknownSource} observation${unknownSource === 1 ? '' : 's'} came from a source that is no longer registered and ${unknownSource === 1 ? 'was' : 'were'} excluded.`,
        );
      }
      if (otherCurrency > 0) {
        notices.push(
          `${otherCurrency} observation${otherCurrency === 1 ? '' : 's'} in another currency ${otherCurrency === 1 ? 'was' : 'were'} excluded; prices are never converted.`,
        );
      }

      logger.debug(
        { productId, period: query.period, observations: observations.length },
        'Price history served',
      );

      return {
        productId: product.id,
        product: {
          id: product.id,
          title: product.title,
          brand: product.brand,
          catalog: CATALOG_ID,
        },
        currency: HISTORY_CURRENCY,
        period: query.period,
        from: from.toISOString(),
        to: to.toISOString(),
        generatedAt: now.toISOString(),
        status,
        observations,
        summary: {
          verified: summarise(verified),
          sample: summarise(sample),
        },
        filters: {
          sourceId: query.sourceId ?? null,
          marketplaceId: query.marketplaceId ?? null,
          limit: query.limit,
        },
        notices: [...new Set(notices)],
      };
    },
  };
}

/** Process-wide instance used by the HTTP layer. */
export const historyService = createHistoryService();
