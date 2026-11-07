import {
  compareOffers,
  demoProducts,
  withProduct,
  type ProductComparisonResponse,
  type SourceCoverageResponse,
} from '@smart-shopping/shared';

import { logger } from '../config/logger.js';
import { AppError } from '../utils/AppError.js';
import { createSourceRegistry, type SourceRegistryOptions } from './sources/registry.js';

/**
 * Comparison service.
 *
 * Sources -> snapshots -> shared engine -> response. Marketplace-specific code
 * lives entirely in the adapters; this file only orchestrates.
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

export interface ComparisonService {
  getComparison(productId: string): Promise<ProductComparisonResponse>;
  getCoverage(): SourceCoverageResponse;
}

export function createComparisonService(options: SourceRegistryOptions = {}): ComparisonService {
  const registry = createSourceRegistry(options);

  return {
    async getComparison(productId: string): Promise<ProductComparisonResponse> {
      const product = demoProducts.find((entry) => entry.id === productId);
      if (!product) {
        throw AppError.notFound(`Unknown product: ${productId}`);
      }

      const now = new Date();
      const snapshots: unknown[] = [];
      const notices: string[] = [];

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

      return {
        ...response,
        notices: [...new Set([...notices, ...response.notices])],
      };
    },

    getCoverage(): SourceCoverageResponse {
      return registry.coverage();
    },
  };
}

/** Process-wide instance used by the HTTP layer. */
export const comparisonService = createComparisonService();
