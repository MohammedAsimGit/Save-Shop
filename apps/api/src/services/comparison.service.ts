import {
  compareOffers,
  demoProducts,
  productComparisonResponseSchema,
  withProduct,
  type ProductComparisonResponse,
  type SourceCoverageResponse,
} from '@smart-shopping/shared';

import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { AppError } from '../utils/AppError.js';
import { comparisonCache, comparisonCacheKey, type ComparisonCache } from './cache/index.js';
import { snapshotStore as sharedSnapshotStore, type SnapshotStore } from './snapshots/index.js';
import { createSourceRegistry, type SourceRegistryOptions } from './sources/registry.js';

/**
 * Comparison service.
 *
 * Sources -> snapshots -> shared engine -> response, with two Sprint 3 additions:
 * snapshots are persisted (best effort) and responses are cached per product and
 * source set.
 *
 * Rules that protect the shopper:
 * - a cached payload is re-validated against the contract and re-checked against
 *   every offer's own freshness window before it is served;
 * - a run where any adapter failed is never cached, so a transient provider error
 *   cannot pin a degraded comparison in place for minutes;
 * - persistence failures are logged and ignored: history is secondary to the
 *   price being displayed right now.
 *
 * Current limits, stated rather than hidden:
 * - Product identity comes from the shared demo catalogue. A real catalogue source
 *   is a later sprint; offers already come exclusively from adapters.
 * - One failing adapter degrades coverage, it does not take the endpoint down.
 */

/** Sprint 2 compares Indian marketplace prices only. */
const COMPARISON_CURRENCY = 'INR';

/** Product identity is still catalogue-owned until a catalogue source exists. */
const CATALOG_ID = 'demo-catalog';

export interface ComparisonServiceOptions extends SourceRegistryOptions {
  readonly cache?: ComparisonCache;
  readonly snapshotStore?: SnapshotStore;
  /** Overrides `PERSIST_DEMO_SNAPSHOTS`; tests use it to isolate provenance rules. */
  readonly persistDemoSnapshots?: boolean;
  /** Upper bound for a cached response; 0 disables caching. */
  readonly cacheTtlSeconds?: number;
}

export interface ComparisonService {
  getComparison(productId: string): Promise<ProductComparisonResponse>;
  getCoverage(): SourceCoverageResponse;
  /** Drops cached comparisons for one product, or every product when omitted. */
  invalidate(productId?: string): Promise<void>;
  readonly cache: ComparisonCache;
  readonly snapshotStore: SnapshotStore;
}

export function createComparisonService(options: ComparisonServiceOptions = {}): ComparisonService {
  const registry = createSourceRegistry(options);
  const cache = options.cache ?? comparisonCache;
  // Sharing the store with the history service is what makes ingestion visible.
  const snapshotStore = options.snapshotStore ?? sharedSnapshotStore;
  const clock = options.now ?? (() => new Date());
  const persistSample = options.persistDemoSnapshots ?? env.persistDemoSnapshots;
  const maxCacheTtlSeconds = options.cacheTtlSeconds ?? env.COMPARISON_CACHE_TTL_SECONDS;

  const enabledSourceIds = registry.enabledAdapters.map((adapter) => adapter.source.id);

  const cacheKeyFor = (productId: string): string =>
    comparisonCacheKey({
      productId,
      currency: COMPARISON_CURRENCY,
      enabledSourceIds,
    });

  /**
   * Returns a cached response only when it is still honest: parseable, inside its
   * cache TTL, and every offer still inside its own source freshness window.
   */
  async function readCachedComparison(
    productId: string,
    now: Date,
  ): Promise<ProductComparisonResponse | null> {
    const key = cacheKeyFor(productId);

    try {
      const entry = await cache.get(key);
      if (!entry) return null;

      if (entry.expiresAt.getTime() <= now.getTime()) {
        await cache.delete(key);
        return null;
      }

      const parsed = productComparisonResponseSchema.safeParse(entry.payload);
      if (!parsed.success) {
        logger.warn(
          { productId },
          'Discarding cached comparison that no longer matches the contract',
        );
        await cache.delete(key);
        return null;
      }

      const stalest = parsed.data.offers.find(
        (offer) => Date.parse(offer.capturedAt) + offer.ttlSeconds * 1000 <= now.getTime(),
      );
      if (stalest) {
        logger.info(
          { productId, marketplaceId: stalest.marketplaceId },
          'Cached comparison contains an observation past its TTL; recomputing',
        );
        await cache.delete(key);
        return null;
      }

      logger.debug({ productId }, 'Comparison cache hit');
      return parsed.data;
    } catch (error) {
      // A cache outage must never break the endpoint.
      logger.warn({ err: error, productId }, 'Comparison cache read failed; recomputing');
      return null;
    }
  }

  /**
   * Caches only a complete, non-empty, still-fresh result. The TTL is the smallest
   * remaining freshness across the ranked offers, capped by configuration.
   */
  async function writeCachedComparison(
    productId: string,
    response: ProductComparisonResponse,
    now: Date,
  ): Promise<void> {
    if (maxCacheTtlSeconds <= 0 || response.offers.length === 0) return;

    const remainingSeconds = Math.min(
      ...response.offers.map(
        (offer) => (Date.parse(offer.capturedAt) + offer.ttlSeconds * 1000 - now.getTime()) / 1000,
      ),
    );
    const ttlSeconds = Math.min(maxCacheTtlSeconds, Math.floor(remainingSeconds));
    if (ttlSeconds < 1) return;

    try {
      await cache.set({
        key: cacheKeyFor(productId),
        payload: response,
        createdAt: now,
        expiresAt: new Date(now.getTime() + ttlSeconds * 1000),
      });
    } catch (error) {
      logger.warn({ err: error, productId }, 'Comparison cache write failed; response not cached');
    }
  }

  async function persistSnapshots(snapshots: readonly unknown[], now: Date): Promise<void> {
    if (snapshots.length === 0) return;

    try {
      const result = await snapshotStore.saveMany(snapshots, {
        sources: registry.sources,
        now,
        includeSampleSources: persistSample,
      });
      logger.debug(result, 'Price observations persisted');
    } catch (error) {
      logger.warn(
        { err: error },
        'Could not persist price observations; continuing with the live comparison',
      );
    }
  }

  return {
    cache,
    snapshotStore,

    async getComparison(productId: string): Promise<ProductComparisonResponse> {
      const product = demoProducts.find((entry) => entry.id === productId);
      if (!product) {
        throw AppError.notFound(`Unknown product: ${productId}`);
      }

      const now = clock();

      const cached = await readCachedComparison(productId, now);
      if (cached) return cached;

      const snapshots: unknown[] = [];
      const notices: string[] = [];
      let failedSources = 0;

      const results = await Promise.all(
        registry.enabledAdapters.map(async (adapter) => {
          try {
            const result = await adapter.fetchOffers(productId, { now });
            return { adapter, result };
          } catch (error) {
            logger.warn(
              { err: error, sourceId: adapter.source.id, productId },
              'Price source failed; continuing with remaining sources',
            );
            return { adapter, error };
          }
        }),
      );

      for (const outcome of results) {
        if ('result' in outcome && outcome.result) {
          snapshots.push(...outcome.result.snapshots);
          notices.push(...outcome.result.warnings);
          continue;
        }
        failedSources += 1;
        notices.push(
          `${outcome.adapter.source.displayName} could not be read, so its offers are missing.`,
        );
      }

      const comparison = compareOffers({
        snapshots,
        sources: registry.sources,
        currency: COMPARISON_CURRENCY,
        now,
        productId,
      });

      const response = withProduct(comparison, {
        id: product.id,
        title: product.title,
        brand: product.brand,
        catalog: CATALOG_ID,
      });

      // Ingest exactly what the adapters reported; nothing is synthesised.
      await persistSnapshots(snapshots, now);

      const complete: ProductComparisonResponse = {
        ...response,
        notices: [...new Set([...notices, ...response.notices])],
      };

      // A degraded run must not become the cached answer for the next few minutes.
      if (failedSources === 0) {
        await writeCachedComparison(productId, complete, now);
      }

      return complete;
    },

    getCoverage(): SourceCoverageResponse {
      return registry.coverage();
    },

    async invalidate(productId?: string): Promise<void> {
      try {
        if (productId) {
          await cache.delete(cacheKeyFor(productId));
          return;
        }
        await cache.clear();
      } catch (error) {
        logger.warn({ err: error, productId }, 'Comparison cache invalidation failed');
      }
    },
  };
}

/** Process-wide instance used by the HTTP layer. */
export const comparisonService = createComparisonService();
