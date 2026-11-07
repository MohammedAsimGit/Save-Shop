import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import type { ComparisonCache } from './comparisonCache.js';
import { createMemoryComparisonCache } from './memoryComparisonCache.js';
import { createMongoComparisonCache } from './mongoComparisonCache.js';

export type { ComparisonCache, ComparisonCacheEntry } from './comparisonCache.js';
export { comparisonCacheKey, COMPARISON_CACHE_VERSION } from './comparisonCache.js';

/**
 * Chooses the comparison cache once per process.
 *
 * Both backends must behave identically, which is why freshness is checked by the
 * service rather than by the store's eviction mechanism.
 */
export function createComparisonCache(): ComparisonCache {
  if (!env.isDatabaseConfigured) {
    logger.info('MONGODB_URI is not set - comparisons are cached in memory for this process.');
    return createMemoryComparisonCache();
  }

  logger.info('Comparison cache: MongoDB collection "comparison_cache"');
  return createMongoComparisonCache();
}

/** Process-wide cache shared by the comparison service and invalidation hooks. */
export const comparisonCache: ComparisonCache = createComparisonCache();
