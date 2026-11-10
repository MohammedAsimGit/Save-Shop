import { demoProducts } from '@smart-shopping/shared';

import { catalogueService } from './index.js';

/**
 * Product identity resolution for the comparison and history endpoints.
 *
 * The canonical catalogue is authoritative. Two fallbacks exist and are deliberately
 * narrow:
 *
 * 1. when MongoDB is not configured the in-memory catalogue can be empty until it
 *    is seeded, and the shared demo catalogue is the documented development base;
 * 2. a product that exists only in the demo catalogue keeps working exactly as it
 *    did before Sprint 5, but the caller is told identity came from sample data.
 *
 * A product that exists in neither is simply unknown - nothing is invented.
 */

export interface ResolvedProductIdentity {
  readonly id: string;
  readonly title: string;
  readonly brand: string;
  /** Which catalogue the identity came from; surfaced in responses/notices. */
  readonly catalog: string;
  readonly isSample: boolean;
  readonly canonical: boolean;
}

const DEMO_CATALOG_ID = 'demo-catalog';

/**
 * Builds the identity resolver around a catalogue service. Injectable so a test can
 * run the real redirect logic against its own persistence layer instead of the
 * process-wide singleton.
 */
export function createProductIdentityResolver(catalogue: {
  readonly resolveProduct: (productId: string) => Promise<{
    readonly id: string;
    readonly name: string;
    readonly brand: string;
    readonly isSample: boolean;
  } | null>;
}): (productId: string) => Promise<ResolvedProductIdentity | null> {
  return async (productId) => {
    const canonical = await catalogue.resolveProduct(productId);
    if (canonical) {
      return {
        id: canonical.id,
        title: canonical.name,
        brand: canonical.brand,
        catalog: DEMO_CATALOG_ID,
        isSample: canonical.isSample,
        canonical: true,
      };
    }

    const demo = demoProducts.find((entry) => entry.id === productId);
    if (!demo) return null;

    return {
      id: demo.id,
      title: demo.title,
      brand: demo.brand,
      catalog: DEMO_CATALOG_ID,
      isSample: true,
      canonical: false,
    };
  };
}

/** Process-wide resolver used by the comparison and history endpoints. */
export const resolveProductIdentity = createProductIdentityResolver(catalogueService);
