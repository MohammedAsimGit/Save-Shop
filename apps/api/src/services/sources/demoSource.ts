import {
  demoProducts,
  marketplaceById,
  marketplaces,
  type MarketSource,
  type OfferSnapshot,
} from '@smart-shopping/shared';

import type {
  MarketSourceAdapter,
  SourceFetchContext,
  SourceFetchResult,
} from './sourceAdapter.js';

/**
 * Demo source adapter.
 *
 * The only enabled source in Sprint 2. It reads the shared sample catalogue and
 * labels every observation as invented, so no code path can mistake this for a
 * marketplace price. Deterministic: given the same clock and product, the output
 * is identical, which makes tests and screenshots reproducible.
 *
 * Replacing it with an authorised provider means registering a different adapter;
 * no comparison logic changes.
 */

export const DEMO_SOURCE_ID = 'demo-catalog';

/**
 * Observations look recent but are derived from the clock, never from `Date.now()`.
 * Every offset stays well inside the TTL, so demo offers are always fresh - the
 * stale path is exercised by the engine tests instead of by flaky demo data.
 */
const OBSERVATION_OFFSET_MINUTES = [2, 9, 17, 26] as const;
const DEMO_TTL_SECONDS = 3_600;

export const DEMO_SOURCE: MarketSource = {
  id: DEMO_SOURCE_ID,
  displayName: 'SaveShop demo catalogue',
  kind: 'demo',
  // Sample data can never be reported as verified, whatever the UI does with it.
  verification: 'sample',
  attribution: {
    label: 'Invented sample prices, not marketplace data',
  },
  permission: {
    status: 'granted',
    note: 'Local sample data. No marketplace terms apply because no marketplace data is used.',
    permitsPriceAlerts: false,
  },
  coverage: {
    countries: ['IN'],
    // Catalogue marketplace ids, so coverage always names what the adapter can return.
    marketplaces: marketplaces.map((marketplace) => marketplace.id),
  },
  enabled: true,
};

function demoProductUrl(productId: string): string {
  // `.example` is reserved by RFC 2606, so this can never resolve to a real shop.
  return `https://demo.saveshop.example/product/${productId}`;
}

export interface DemoSourceOptions {
  /** Injectable clock so capturedAt values are reproducible. */
  readonly now?: () => Date;
}

export function createDemoSourceAdapter(options: DemoSourceOptions = {}): MarketSourceAdapter {
  const clock = options.now ?? (() => new Date());

  return {
    source: DEMO_SOURCE,
    isEnabled: DEMO_SOURCE.enabled,

    async fetchOffers(productId: string, context: SourceFetchContext): Promise<SourceFetchResult> {
      const product = demoProducts.find((entry) => entry.id === productId);
      if (!product) {
        return { snapshots: [], warnings: [`Demo catalogue has no product "${productId}"`] };
      }

      const now = context.now ?? clock();

      const snapshots: OfferSnapshot[] = product.offers.map((offer, index) => {
        const offsetMinutes =
          OBSERVATION_OFFSET_MINUTES[index % OBSERVATION_OFFSET_MINUTES.length] ?? 5;
        const marketplace = marketplaceById(offer.marketplaceId);

        return {
          productId: product.id,
          marketplaceId: offer.marketplaceId,
          sourceId: DEMO_SOURCE_ID,
          productUrl: demoProductUrl(product.id),
          price: offer.price,
          availability: offer.inStock ? 'in_stock' : 'out_of_stock',
          capturedAt: new Date(now.getTime() - offsetMinutes * 60_000).toISOString(),
          ttlSeconds: DEMO_TTL_SECONDS,
          attribution: {
            label: `${marketplace?.name ?? offer.marketplaceId} - invented sample price`,
          },
        };
      });

      return {
        snapshots,
        warnings: [
          'Demo source: prices are generated sample values, not marketplace observations.',
        ],
      };
    },
  };
}
