import { beforeEach, describe, expect, it } from 'vitest';

import type { CanonicalProduct } from '@smart-shopping/shared';

import { createTestCatalogue, makeProduct, syntheticGtin } from './helpers/catalogue.js';

/**
 * Identity matching rules.
 *
 * These tests exist to keep the conservative rules honest: an identifier decides,
 * a model decides, a title alone never does, and a variant is not its sibling.
 */

const GTIN_XM5 = syntheticGtin('400638133393');
const GTIN_OTHER = syntheticGtin('590123412345');

const products: readonly CanonicalProduct[] = [
  makeProduct({
    id: 'sony-wh1000xm5',
    name: 'Sony WH-1000XM5 Wireless Headphones',
    brand: 'Sony',
    category: 'audio',
    model: 'WH1000XM5',
    mpn: 'WH-1000XM5/B',
    gtin: GTIN_XM5,
    color: 'black',
  }),
  makeProduct({
    id: 'apple-iphone-15-128-blue',
    name: 'Apple iPhone 15 128 GB Blue',
    brand: 'Apple',
    category: 'phones',
    model: 'A3090',
    storageCapacity: '128gb',
    color: 'blue',
    variantOf: 'apple-iphone-15',
  }),
  makeProduct({
    id: 'apple-iphone-15-256-black',
    name: 'Apple iPhone 15 256 GB Black',
    brand: 'Apple',
    category: 'phones',
    model: 'A3090',
    storageCapacity: '256gb',
    color: 'black',
    variantOf: 'apple-iphone-15',
  }),
  makeProduct({
    id: 'galaxy-watch6-40',
    name: 'Samsung Galaxy Watch 6',
    brand: 'Samsung',
    category: 'wearables',
    variantOf: 'galaxy-watch6',
  }),
  makeProduct({
    id: 'galaxy-watch6-44',
    name: 'Samsung Galaxy Watch 6',
    brand: 'Samsung',
    category: 'wearables',
    variantOf: 'galaxy-watch6',
  }),
];

const { store, matcher } = createTestCatalogue();

beforeEach(async () => {
  // The memory store persists across tests in this file; seed once per test.
  for (const product of products) {
    await store.upsertProducts([product]);
  }
});

describe('identity matching', () => {
  it('matches exactly on a GTIN', async () => {
    const match = await matcher.match({
      title: 'Sony wireless headphones',
      gtin: GTIN_XM5,
    });

    expect(match.status).toBe('exact');
    expect(match.method).toBe('gtin');
    expect(match.confidence).toBe(100);
    expect(match.requiresReview).toBe(false);
    expect(match.canonicalProductId).toBe('sony-wh1000xm5');
  });

  it('matches strongly on a manufacturer part number', async () => {
    const match = await matcher.match({
      title: 'Sony over-ear headphones',
      brand: 'Sony',
      mpn: 'WH-1000XM5/B',
    });

    expect(match.status).toBe('strong');
    expect(match.method).toBe('mpn');
    expect(match.canonicalProductId).toBe('sony-wh1000xm5');
  });

  it('matches strongly on brand and model', async () => {
    const match = await matcher.match({
      title: 'Sony WH-1000XM5',
      brand: 'Sony',
      model: 'WH1000XM5',
    });

    expect(match.status).toBe('strong');
    expect(match.method).toBe('brand_model');
    expect(match.canonicalProductId).toBe('sony-wh1000xm5');
  });

  it('resolves the right storage variant instead of the sibling', async () => {
    const match = await matcher.match({
      title: 'Apple iPhone 15 256 GB Black',
      brand: 'Apple',
      model: 'A3090',
      storageCapacity: '256 GB',
      color: 'Black',
    });

    expect(match.status).toBe('strong');
    expect(match.method).toBe('brand_model_specs');
    expect(match.canonicalProductId).toBe('apple-iphone-15-256-black');
  });

  it('treats a different storage capacity as a different variant', async () => {
    const match = await matcher.match({
      title: 'Apple iPhone 15 512 GB Blue',
      brand: 'Apple',
      model: 'A3090',
      storageCapacity: '512gb',
      color: 'Blue',
    });

    expect(match.status).toBe('conflict');
    expect(match.canonicalProductId).toBeNull();
    expect(match.requiresReview).toBe(true);
  });

  it('treats a different colour as a different variant', async () => {
    const match = await matcher.match({
      title: 'Apple iPhone 15 128 GB Red',
      brand: 'Apple',
      model: 'A3090',
      storageCapacity: '128gb',
      color: 'Red',
    });

    expect(match.status).toBe('conflict');
    expect(match.canonicalProductId).toBeNull();
  });

  it('keeps product generations apart', async () => {
    const match = await matcher.match({
      title: 'Sony WH-1000XM4 Wireless Headphones',
      brand: 'Sony',
    });

    expect(match.status).toBe('conflict');
    expect(match.reasons.join(' ')).toMatch(/generation/i);
    expect(match.canonicalProductId).toBeNull();
  });

  it('never matches an accessory to the product', async () => {
    const match = await matcher.match({
      title: 'Hard Case for Sony WH-1000XM5',
      brand: 'Sony',
      gtin: GTIN_XM5,
    });

    expect(match.status).toBe('conflict');
    expect(match.reasons.join(' ')).toMatch(/accessory/i);
    expect(match.canonicalProductId).toBeNull();
  });

  it('blocks a conflicting GTIN even when the title fits', async () => {
    const match = await matcher.match({
      title: 'Sony WH-1000XM5 Wireless Headphones',
      brand: 'Sony',
      gtin: GTIN_OTHER,
    });

    expect(match.status).toBe('conflict');
    expect(match.canonicalProductId).toBeNull();
  });

  it('leaves an equally plausible match unresolved for review', async () => {
    const match = await matcher.match({
      title: 'Samsung Galaxy Watch 6',
      brand: 'Samsung',
    });

    expect(match.status).toBe('possible');
    expect(match.requiresReview).toBe(true);
    expect(match.canonicalProductId).toBeNull();
    expect(match.confidence).toBeGreaterThan(0);
    expect(match.confidence).toBeLessThan(90);
  });

  it('reports an unmatched listing instead of guessing', async () => {
    const match = await matcher.match({
      title: 'Bose QuietComfort Ultra Headphones',
      brand: 'Bose',
    });

    expect(match.status).toBe('unmatched');
    expect(match.method).toBe('none');
    expect(match.confidence).toBe(0);
    expect(match.canonicalProductId).toBeNull();
  });

  it('never matches on title similarity alone when the brand differs', async () => {
    const match = await matcher.match({
      title: 'Sony WH-1000XM5 alternative',
      brand: 'NotSony',
    });

    // No identifier, no model, brand disagrees: the shared title is not identity.
    expect(match.canonicalProductId).toBeNull();
    expect(['possible', 'unmatched']).toContain(match.status);
  });
});
