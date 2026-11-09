import { gtinCheckDigit, normalizeGtin, type CanonicalProduct } from '@smart-shopping/shared';

import {
  type CanonicalProductInput,
  type CatalogueSource,
} from '../../src/services/catalogue/catalogueSource.js';
import { createMemoryCatalogueStore } from '../../src/services/catalogue/memoryCatalogueStore.js';
import { createIdentityMatcher } from '../../src/services/catalogue/matching.service.js';

/**
 * Catalogue fixtures.
 *
 * Identifiers here are **synthetic test values**: the check digits are computed, so
 * they are valid GTINs, but they identify fixtures only. Nothing in this file is a
 * real product identifier and none of it is ever seeded into the running catalogue.
 */

const FIXED_TIME = '2026-01-01T00:00:00.000Z';

/** Builds a valid GTIN-14 from a payload by computing the GS1 check digit. */
export function syntheticGtin(payload: string): string {
  const check = gtinCheckDigit(payload);
  const normalized = normalizeGtin(`${payload}${check}`);
  if (!normalized) throw new Error(`Could not build a GTIN from "${payload}"`);
  return normalized;
}

export function makeProduct(
  overrides: Partial<CanonicalProduct> & Pick<CanonicalProduct, 'id' | 'name' | 'brand'>,
): CanonicalProduct {
  return {
    category: 'audio',
    specifications: {},
    variantOf: null,
    variantAttributes: {},
    imageUrls: [],
    status: 'active',
    provenance: 'manual',
    isSample: false,
    mergedInto: null,
    mergedAt: null,
    createdAt: FIXED_TIME,
    updatedAt: FIXED_TIME,
    ...overrides,
  };
}

/** A store and matcher wired exactly as production wires them. */
export function createTestCatalogue() {
  const store = createMemoryCatalogueStore();
  const matcher = createIdentityMatcher({ store });
  return { store, matcher };
}

/** Minimal source for ingestion tests; records are supplied verbatim. */
export function makeSource(options: {
  id?: string;
  products?: readonly CanonicalProductInput[];
  listings?: readonly unknown[];
  trustsCanonicalIds?: boolean;
  isSample?: boolean;
}): CatalogueSource {
  return {
    id: options.id ?? 'test-source',
    displayName: 'Test catalogue source',
    kind: 'file',
    provenance: options.isSample ? 'demo' : 'manual',
    isSample: options.isSample ?? false,
    trustsCanonicalIds: options.trustsCanonicalIds ?? false,
    async read() {
      return {
        products: options.products ?? [],
        listings: options.listings ?? [],
        warnings: [],
      };
    },
  };
}
