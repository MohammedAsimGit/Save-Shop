import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { canonicalProductSchema, marketplaceListingSchema } from '@smart-shopping/shared';

import { CanonicalProductModel } from '../src/models/canonicalProduct.js';
import { MarketplaceListingModel } from '../src/models/marketplaceListing.js';
import { createMongoCatalogueStore } from '../src/services/catalogue/mongoCatalogueStore.js';
import {
  ingestCatalogue,
  ingestDemoCatalogue,
} from '../src/services/catalogue/ingestion.service.js';
import { createIdentityMatcher } from '../src/services/catalogue/matching.service.js';
import { listingContentHash, listingKey } from '../src/services/catalogue/catalogueStore.js';
import { makeProduct, makeSource, syntheticGtin } from './helpers/catalogue.js';

/**
 * MongoDB-backed catalogue.
 *
 * Runs against a real `mongod` binary because the guarantees live in the database:
 * the unique product id, the partial unique GTIN, the listing dedupe key and the
 * insert-only/upsert behaviour of the store.
 */

let server: MongoMemoryServer;

const store = createMongoCatalogueStore();
const matcher = createIdentityMatcher({ store });
const GTIN = syntheticGtin('400638133393');
const NOW = new Date('2026-12-01T12:00:00.000Z');

beforeAll(async () => {
  server = await MongoMemoryServer.create();
  await mongoose.connect(server.getUri(), { dbName: 'saveshop-catalogue-test' });
  await Promise.all([
    CanonicalProductModel.createIndexes(),
    MarketplaceListingModel.createIndexes(),
  ]);
}, 180_000);

afterAll(async () => {
  await mongoose.disconnect();
  await server.stop();
}, 60_000);

beforeEach(async () => {
  await Promise.all([CanonicalProductModel.deleteMany({}), MarketplaceListingModel.deleteMany({})]);
});

function listing(overrides: Record<string, unknown> = {}) {
  const base = {
    id: listingKey({ sourceId: 'test-source', marketplaceId: 'amazon', externalId: 'item-1' }),
    canonicalProductId: 'sony-wh1000xm5',
    sourceId: 'test-source',
    marketplaceId: 'amazon',
    externalId: 'item-1',
    title: 'Sony WH-1000XM5',
    url: 'https://demo.saveshop.example/product/sony-wh1000xm5',
    brand: 'Sony',
    specifications: {},
    provenance: 'manual' as const,
    isSample: false,
    match: {
      status: 'exact' as const,
      method: 'gtin' as const,
      confidence: 100,
      requiresReview: false,
      reasons: ['GTIN matched exactly'],
    },
    revision: 0,
    review: null,
    lastObservedAt: NOW.toISOString(),
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...overrides,
  };

  return { ...base, contentHash: listingContentHash(base) };
}

describe('catalogue model', () => {
  it('creates the unique id, partial GTIN and listing dedupe indexes', async () => {
    const productIndexes = await CanonicalProductModel.collection.indexes();
    expect(productIndexes.some((index) => index.unique === true && index.key['id'] === 1)).toBe(
      true,
    );
    const gtinIndex = productIndexes.find((index) => index.key['gtin'] === 1);
    expect(gtinIndex?.unique).toBe(true);
    expect(gtinIndex?.partialFilterExpression).toBeTruthy();

    const listingIndexes = await MarketplaceListingModel.collection.indexes();
    const dedupe = listingIndexes.find(
      (index) => index.unique === true && index.key['sourceId'] === 1,
    );
    expect(dedupe?.key).toMatchObject({ sourceId: 1, marketplaceId: 1, externalId: 1 });
  });

  it('refuses a duplicate canonical id and a duplicate GTIN', async () => {
    await store.upsertProducts([
      makeProduct({ id: 'product-a', name: 'Product A', brand: 'Acme', gtin: GTIN }),
    ]);

    await expect(
      CanonicalProductModel.create({
        ...makeProduct({ id: 'product-a', name: 'Impostor', brand: 'Acme' }),
        search: { text: 'impostor', tokens: ['impostor'], brandKey: 'acme', modelKey: null },
      }),
    ).rejects.toThrow();

    await store.upsertProducts([makeProduct({ id: 'product-b', name: 'B', brand: 'Acme' })]);

    // Insert-only ingestion means a duplicate id is skipped, never overwritten.
    await expect(
      CanonicalProductModel.create({
        ...makeProduct({ id: 'product-c', name: 'Product C', brand: 'Acme', gtin: GTIN }),
        search: { text: 'product c', tokens: ['product', 'c'], brandKey: 'acme', modelKey: null },
      }),
    ).rejects.toThrow();
  });
});

describe('MongoDB catalogue store', () => {
  it('round-trips a canonical product through the contract', async () => {
    const product = makeProduct({
      id: 'apple-iphone-15-128-blue',
      name: 'Apple iPhone 15 128 GB Blue',
      brand: 'Apple',
      category: 'phones',
      model: 'A3090',
      storageCapacity: '128gb',
      color: 'blue',
      variantOf: 'apple-iphone-15',
    });

    await store.upsertProducts([product]);
    const stored = await store.findProduct(product.id);

    expect(stored).not.toBeNull();
    expect(canonicalProductSchema.safeParse(stored).success).toBe(true);
    expect(stored?.storageCapacity).toBe('128gb');
    expect(stored?.variantOf).toBe('apple-iphone-15');
  });

  it('is insert-only for products and reports existing records', async () => {
    const product = makeProduct({ id: 'product-a', name: 'Product A', brand: 'Acme' });

    const first = await store.upsertProducts([product]);
    const second = await store.upsertProducts([{ ...product, name: 'Renamed' }]);

    expect(first).toEqual({ inserted: 1, existing: 0 });
    expect(second).toEqual({ inserted: 0, existing: 1 });
    expect((await store.findProduct('product-a'))?.name).toBe('Product A');
  });

  it('finds candidates by identifier, brand and name token', async () => {
    await store.upsertProducts([
      makeProduct({
        id: 'sony-wh1000xm5',
        name: 'Sony WH-1000XM5 Wireless Headphones',
        brand: 'Sony',
        model: 'WH1000XM5',
        gtin: GTIN,
      }),
      makeProduct({ id: 'bose-qc', name: 'Bose QuietComfort', brand: 'Bose' }),
    ]);

    const byGtin = await store.findCandidates({ gtin: GTIN, limit: 10 });
    expect(byGtin.map((product) => product.id)).toEqual(['sony-wh1000xm5']);

    const byBrand = await store.findCandidates({ brandKey: 'bose', limit: 10 });
    expect(byBrand.map((product) => product.id)).toEqual(['bose-qc']);

    const byToken = await store.findCandidates({ nameTokens: ['quietcomfort'], limit: 10 });
    expect(byToken.map((product) => product.id)).toEqual(['bose-qc']);
  });

  it('filters search candidates by status, category and token', async () => {
    await store.upsertProducts([
      makeProduct({ id: 'sony-wh1000xm5', name: 'Sony WH-1000XM5', brand: 'Sony' }),
      makeProduct({
        id: 'iphone-15',
        name: 'Apple iPhone 15',
        brand: 'Apple',
        category: 'phones',
      }),
      makeProduct({
        id: 'archived-watch',
        name: 'Samsung Galaxy Watch',
        brand: 'Samsung',
        category: 'wearables',
        status: 'archived',
      }),
    ]);

    const phones = await store.searchCandidates({
      query: { q: '', page: 1, pageSize: 12, status: 'active' },
      status: 'active',
      category: 'phones',
      tokens: [],
      limit: 50,
    });
    expect(phones.map((product) => product.id)).toEqual(['iphone-15']);

    const active = await store.searchCandidates({
      query: { q: '', page: 1, pageSize: 12, status: 'active' },
      status: 'active',
      tokens: ['galaxy'],
      limit: 50,
    });
    // Archived products are not searchable by default.
    expect(active).toEqual([]);
  });

  it('deduplicates listings and reports unchanged content', async () => {
    await store.upsertProducts([
      makeProduct({ id: 'sony-wh1000xm5', name: 'Sony', brand: 'Sony' }),
    ]);

    const first = await store.upsertListings([listing()]);
    const second = await store.upsertListings([listing()]);
    const changed = await store.upsertListings([
      listing({ title: 'Sony WH-1000XM5 (new listing)' }),
    ]);

    expect(first).toEqual({ created: 1, updated: 0, unchanged: 0 });
    expect(second).toEqual({ created: 0, updated: 0, unchanged: 1 });
    expect(changed).toEqual({ created: 0, updated: 1, unchanged: 0 });

    const stored = await MarketplaceListingModel.find({}).lean();
    expect(stored).toHaveLength(1);
    expect(marketplaceListingSchema.safeParse(stored[0]).success).toBe(false);
    expect(stored[0]?.title).toBe('Sony WH-1000XM5 (new listing)');
  });

  it('lists only resolved listings for a product and counts the rest', async () => {
    await store.upsertProducts([
      makeProduct({ id: 'sony-wh1000xm5', name: 'Sony', brand: 'Sony' }),
    ]);
    await store.upsertListings([
      listing(),
      listing({
        id: listingKey({ sourceId: 'test-source', marketplaceId: 'croma', externalId: 'item-2' }),
        marketplaceId: 'croma',
        externalId: 'item-2',
        canonicalProductId: null,
        match: {
          status: 'possible',
          method: 'title_similarity',
          confidence: 61,
          requiresReview: true,
          reasons: ['title similarity 0.62'],
        },
      }),
    ]);

    expect(await store.listListings('sony-wh1000xm5', 10)).toHaveLength(1);
    expect(await store.countUnresolvedListings()).toBe(1);
  });
});

describe('ingestion against MongoDB', () => {
  it('migrates the demo catalogue once and is idempotent afterwards', async () => {
    const first = await ingestDemoCatalogue({ store, matcher, now: () => NOW });
    const second = await ingestDemoCatalogue({ store, matcher, now: () => NOW });

    expect(first.created).toBeGreaterThan(0);
    expect(second.created).toBe(0);
    expect(second.canonicalProductsInserted).toBe(0);
    expect(second.unchanged).toBe(first.accepted);
    expect(await store.countListings()).toBe(first.accepted);
  });

  it('stores a conflicting listing unresolved and never attaches it', async () => {
    await store.upsertProducts([
      makeProduct({
        id: 'acme-1',
        name: 'Acme One',
        brand: 'Acme',
        model: 'AC-1',
        gtin: GTIN,
      }),
    ]);

    const report = await ingestCatalogue({
      sources: [
        makeSource({
          listings: [
            {
              marketplaceId: 'amazon',
              externalId: 'conflict-1',
              title: 'Acme One (import)',
              url: 'https://demo.saveshop.example/product/acme-1',
              brand: 'Acme',
              gtin: syntheticGtin('590123412345'),
            },
          ],
        }),
      ],
      store,
      matcher,
      now: () => NOW,
    });

    expect(report.matches.conflict).toBe(1);
    expect(await store.listListings('acme-1', 10)).toHaveLength(0);
    expect(await store.countUnresolvedListings()).toBe(1);
  });
});
