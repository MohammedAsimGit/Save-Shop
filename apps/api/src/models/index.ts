import { CanonicalProductModel } from './canonicalProduct.js';
import { CatalogueIngestionRunModel } from './catalogueIngestionRun.js';
import { ComparisonCacheModel } from './comparisonCache.js';
import { MarketplaceListingModel } from './marketplaceListing.js';
import { PriceDailyRollupModel } from './priceDailyRollup.js';
import { PriceSnapshotModel } from './priceSnapshot.js';
import { RetentionRunModel } from './retentionRun.js';

/**
 * Creates the indexes the persistence layer depends on.
 *
 * Mongoose's `autoIndex` does this lazily on first use, but the unique keys are
 * what make ingestion, rollup generation and cache writes idempotent, and the
 * history queries are useless without their compound indexes. Doing it explicitly
 * at boot means the guarantees exist before the first request, not after the first
 * write.
 *
 * Safe to re-run: MongoDB treats an identical index definition as a no-op.
 */
export async function ensureModelIndexes(): Promise<void> {
  await Promise.all([
    PriceSnapshotModel.createIndexes(),
    ComparisonCacheModel.createIndexes(),
    PriceDailyRollupModel.createIndexes(),
    RetentionRunModel.createIndexes(),
    CanonicalProductModel.createIndexes(),
    MarketplaceListingModel.createIndexes(),
    CatalogueIngestionRunModel.createIndexes(),
  ]);
}
