import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { createCatalogueService, type CatalogueService } from './catalogue.service.js';
import { createMemoryCatalogueStore } from './memoryCatalogueStore.js';
import { createMongoCatalogueStore } from './mongoCatalogueStore.js';
import { createIdentityMatcher, type IdentityMatcher } from './matching.service.js';
import type { CatalogueStore } from './catalogueStore.js';
import { ingestDemoCatalogue, type IngestionReport } from './ingestion.service.js';

export type { CatalogueStore, StoredListing } from './catalogueStore.js';
export type { CatalogueService } from './catalogue.service.js';
export type { IdentityMatcher, MatchDecision } from './matching.service.js';
export type { IngestionReport, RejectedRecord } from './ingestion.service.js';
export { createCatalogueService, relevanceScore } from './catalogue.service.js';
export { createIdentityMatcher, scoreCandidate } from './matching.service.js';
export { ingestCatalogue, ingestDemoCatalogue } from './ingestion.service.js';
export {
  createDemoCatalogueSource,
  createFileCatalogueSource,
  catalogueRecordSchema,
} from './catalogueSource.js';

/**
 * Chooses the catalogue store once per process, like the snapshot store: MongoDB
 * when configured, memory otherwise (development mode).
 */
export function createCatalogueStore(): CatalogueStore {
  if (!env.isDatabaseConfigured) {
    logger.info(
      'MONGODB_URI is not set - the product catalogue is kept in memory for this process.',
    );
    return createMemoryCatalogueStore();
  }

  logger.info(
    'Product catalogue store: MongoDB collections "canonical_products" / "marketplace_listings"',
  );
  return createMongoCatalogueStore();
}

/** Shared process-wide instances: the API, comparison and history must agree. */
export const catalogueStore: CatalogueStore = createCatalogueStore();
export const identityMatcher: IdentityMatcher = createIdentityMatcher({ store: catalogueStore });
export const catalogueService: CatalogueService = createCatalogueService({
  store: catalogueStore,
  matcher: identityMatcher,
});

export interface SeedResult {
  readonly seeded: boolean;
  readonly report?: IngestionReport;
}

/**
 * Seeds the sample catalogue into an empty catalogue.
 *
 * Idempotent by construction: it does nothing once a product exists. A failure to
 * seed never stops the API - an empty catalogue is a valid state and the clients
 * fall back to their local sample data with a notice.
 */
export async function ensureCatalogueSeeded(
  options: {
    readonly store?: CatalogueStore;
    readonly matcher?: IdentityMatcher;
    readonly now?: () => Date;
  } = {},
): Promise<SeedResult> {
  const store = options.store ?? catalogueStore;
  const matcher = options.matcher ?? identityMatcher;

  try {
    if ((await store.countProducts()) > 0) return { seeded: false };

    const report = await ingestDemoCatalogue({
      store,
      matcher,
      ...(options.now ? { now: options.now } : {}),
      logger,
    });

    logger.info(
      { inserted: report.canonicalProductsInserted, listings: report.created },
      'Seeded the sample catalogue into an empty canonical catalogue',
    );
    return { seeded: true, report };
  } catch (error) {
    logger.warn(
      { err: error },
      'Could not seed the sample catalogue; continuing with an empty one',
    );
    return { seeded: false };
  }
}
