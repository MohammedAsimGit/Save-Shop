import { beforeEach, describe, expect, it } from 'vitest';

import { demoProducts } from '@smart-shopping/shared';

import {
  ingestCatalogue,
  ingestDemoCatalogue,
} from '../src/services/catalogue/ingestion.service.js';
import {
  createTestCatalogue,
  makeProduct,
  makeSource,
  syntheticGtin,
} from './helpers/catalogue.js';

/**
 * Catalogue ingestion.
 *
 * The rules under test are the ones that protect identity: the demo catalogue is
 * migrated without inventing identifiers, a rerun changes nothing, invalid records
 * are reported rather than stored, and a weak match is never resolved silently.
 */

const OFFER_COUNT = demoProducts.reduce((total, product) => total + product.offers.length, 0);

describe('demo catalogue migration', () => {
  it('creates one canonical product per demo product and one listing per offer', async () => {
    const { store, matcher } = createTestCatalogue();

    const report = await ingestDemoCatalogue({ store, matcher });

    expect(report.status).toBe('completed');
    expect(report.rejected).toBe(0);
    expect(report.canonicalProductsInserted).toBe(demoProducts.length);
    expect(report.created).toBe(OFFER_COUNT);
    expect(report.matches.exact).toBe(OFFER_COUNT);
    expect(await store.countProducts()).toBe(demoProducts.length);
    expect(await store.countListings()).toBe(OFFER_COUNT);

    const sony = await store.findProduct('sony-wh1000xm5');
    expect(sony?.name).toBe('Sony WH-1000XM5 Wireless Headphones');
    expect(sony?.isSample).toBe(true);
    // Nothing about the sample catalogue justifies a real identifier.
    expect(sony?.gtin).toBeUndefined();
    expect(sony?.mpn).toBeUndefined();

    const listings = await store.listListings('sony-wh1000xm5', 50);
    expect(listings.length).toBeGreaterThan(0);
    expect(listings.every((listing) => listing.isSample)).toBe(true);
    expect(listings.every((listing) => listing.canonicalProductId === 'sony-wh1000xm5')).toBe(true);
  });

  it('is idempotent: a second run writes nothing new', async () => {
    const { store, matcher } = createTestCatalogue();

    await ingestDemoCatalogue({ store, matcher });
    const second = await ingestDemoCatalogue({ store, matcher });

    expect(second.canonicalProductsInserted).toBe(0);
    expect(second.canonicalProductsExisting).toBe(demoProducts.length);
    expect(second.created).toBe(0);
    expect(second.updated).toBe(0);
    expect(second.unchanged).toBe(OFFER_COUNT);
    expect(await store.countListings()).toBe(OFFER_COUNT);
  });

  it('writes nothing during a dry run', async () => {
    const { store, matcher } = createTestCatalogue();

    const report = await ingestDemoCatalogue({ store, matcher, dryRun: true });

    expect(report.dryRun).toBe(true);
    expect(report.recordsRead).toBe(OFFER_COUNT);
    expect(report.accepted).toBe(OFFER_COUNT);
    expect(report.canonicalProductsInserted).toBe(0);
    expect(report.created).toBe(0);
    expect(await store.countProducts()).toBe(0);
    expect(await store.countListings()).toBe(0);
  });
});

describe('ingestion validation and matching', () => {
  beforeEach(() => undefined);

  it('rejects an invalid record with a reason instead of storing it', async () => {
    const { store, matcher } = createTestCatalogue();
    await store.upsertProducts([
      makeProduct({ id: 'demo-product', name: 'Demo Product', brand: 'Demo' }),
    ]);

    const report = await ingestCatalogue({
      sources: [
        makeSource({
          listings: [
            {
              canonicalProductId: 'demo-product',
              marketplaceId: 'amazon',
              externalId: 'valid-1',
              title: 'Demo Product',
              url: 'https://demo.saveshop.example/product/demo-product',
              brand: 'Demo',
            },
            {
              marketplaceId: 'amazon',
              externalId: 'invalid-1',
              title: 'Broken record',
              url: 'not-a-url',
            },
          ],
        }),
      ],
      store,
      matcher,
    });

    expect(report.recordsRead).toBe(1);
    expect(report.accepted).toBe(1);
    expect(report.rejected).toBe(1);
    expect(report.rejectedRecords[0]?.reason).toMatch(/invalid record/);
    expect(await store.countListings()).toBe(1);
  });

  it('rejects an unknown canonical id from a trusted source', async () => {
    const { store, matcher } = createTestCatalogue();

    const report = await ingestCatalogue({
      sources: [
        makeSource({
          trustsCanonicalIds: true,
          listings: [
            {
              canonicalProductId: 'ghost-product',
              marketplaceId: 'amazon',
              externalId: 'ghost-1',
              title: 'Ghost Product',
              url: 'https://demo.saveshop.example/product/ghost',
            },
          ],
        }),
      ],
      store,
      matcher,
    });

    expect(report.rejected).toBe(1);
    expect(report.rejectedRecords[0]?.reason).toMatch(/unknown canonical product id/);
  });

  it('stores a weak match unresolved for review', async () => {
    const { store, matcher } = createTestCatalogue();
    await store.upsertProducts([
      makeProduct({
        id: 'bose-quietcomfort-ultra',
        name: 'Bose QuietComfort Ultra',
        brand: 'Bose',
      }),
    ]);

    const report = await ingestCatalogue({
      sources: [
        makeSource({
          listings: [
            {
              marketplaceId: 'croma',
              externalId: 'bose-1',
              title: 'Bose QuietComfort Ultra Headphones',
              url: 'https://demo.saveshop.example/product/bose',
              brand: 'Bose',
            },
          ],
        }),
      ],
      store,
      matcher,
    });

    expect(report.matches.possible).toBe(1);
    const [listing] = await store.listListings('bose-quietcomfort-ultra', 10);
    // Not attached to the product, so it cannot be compared as if it were verified.
    expect(listing).toBeUndefined();
    expect(await store.countUnresolvedListings()).toBe(1);
  });

  it('records a conflicting identifier as unresolved', async () => {
    const { store, matcher } = createTestCatalogue();
    const gtinA = syntheticGtin('400638133393');
    const gtinB = syntheticGtin('590123412345');

    await store.upsertProducts([
      makeProduct({
        id: 'identifier-product',
        name: 'Identifier Product',
        brand: 'Acme',
        model: 'AC-1',
        gtin: gtinA,
      }),
    ]);

    const report = await ingestCatalogue({
      sources: [
        makeSource({
          listings: [
            {
              marketplaceId: 'amazon',
              externalId: 'conflict-1',
              title: 'Acme Identifier Product',
              url: 'https://demo.saveshop.example/product/acme',
              brand: 'Acme',
              gtin: gtinB,
            },
          ],
        }),
      ],
      store,
      matcher,
    });

    expect(report.matches.conflict).toBe(1);
    expect(await store.listListings('identifier-product', 10)).toHaveLength(0);
    expect(await store.countUnresolvedListings()).toBe(1);
  });
});
