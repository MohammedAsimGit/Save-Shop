import type { MarketSource, OfferSnapshot } from '@smart-shopping/shared';

/**
 * Marketplace source adapters.
 *
 * One adapter per provider, behind a single interface. The comparison service
 * knows nothing about Amazon, Flipkart or demo data: it asks every enabled
 * adapter for snapshots and hands them to the shared engine.
 *
 * Adding a real provider later means writing one adapter - not touching ranking,
 * contracts or UI. Adapters for providers without written permission exist only as
 * disabled descriptors (see `pendingSources.ts`), so coverage stays honest.
 */

export interface SourceFetchContext {
  /** Injected clock; keeps adapters deterministic in tests. */
  readonly now: Date;
}

export interface SourceFetchResult {
  readonly snapshots: readonly OfferSnapshot[];
  /** Non-fatal problems worth surfacing to the caller (rate limit, partial page, ...). */
  readonly warnings: readonly string[];
}

export interface MarketSourceAdapter {
  readonly source: MarketSource;
  readonly isEnabled: boolean;
  /**
   * Returns observations for one product. Never invents a price: an unknown
   * product yields an empty result, and a blocked provider stays disabled.
   */
  fetchOffers(productId: string, context: SourceFetchContext): Promise<SourceFetchResult>;
}
