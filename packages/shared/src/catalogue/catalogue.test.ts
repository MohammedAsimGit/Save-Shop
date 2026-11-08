import { describe, expect, it } from 'vitest';

import {
  canonicalProductSchema,
  catalogueSearchQuerySchema,
  gtinSchema,
  marketplaceListingSchema,
} from '../contracts/catalogue.js';
import {
  detectAccessory,
  extractVariantHints,
  hasGenerationConflict,
  isValidGtin,
  normalizeCapacity,
  normalizeColor,
  normalizeGtin,
  normalizeText,
  titleSimilarity,
} from './normalize.js';

/** Real EAN-13 check digit, used only to prove the validator accepts valid input. */
const VALID_EAN_13 = '4006381333931';

describe('identity normalization', () => {
  it('normalizes text without losing digits', () => {
    expect(normalizeText('Apple iPhone 15 (128 GB, Blue)')).toBe('apple iphone 15 128 gb blue');
    expect(normalizeText('  Sony  WH-1000XM5 ')).toBe('sony wh 1000xm5');
  });

  it('accepts a valid GTIN and rejects a wrong check digit', () => {
    expect(isValidGtin(VALID_EAN_13)).toBe(true);
    expect(normalizeGtin(VALID_EAN_13)).toBe('04006381333931');
    expect(isValidGtin('4006381333932')).toBe(false);
    expect(normalizeGtin('not-a-gtin')).toBeNull();
  });

  it('normalizes capacity and color hints', () => {
    expect(normalizeCapacity('128 GB storage')).toBe('128gb');
    expect(normalizeCapacity('1TB')).toBe('1tb');
    expect(normalizeCapacity('Sony headphones')).toBeNull();
    expect(normalizeColor('Space Grey')).toBe('gray');
    expect(extractVariantHints('Apple iPhone 15 (128 GB, Blue)')).toEqual({
      storageCapacity: '128gb',
      color: 'blue',
    });
  });

  it('keeps different generations apart and accepts an extra qualifier', () => {
    expect(hasGenerationConflict('Sony WH-1000XM5', 'Sony WH-1000XM4')).toBe(true);
    expect(hasGenerationConflict('Sony WH-1000XM5', 'Sony WH-1000XM5 Wireless Headphones')).toBe(
      false,
    );
    // Capacity is not a generation.
    expect(hasGenerationConflict('iPhone 15 128 GB', 'iPhone 15 256 GB')).toBe(false);
  });

  it('recognizes accessories', () => {
    expect(detectAccessory('Hard Case for Sony WH-1000XM5')).toBe(true);
    expect(detectAccessory('Screen protector for iPhone 15')).toBe(true);
    expect(detectAccessory('Sony WH-1000XM5 Wireless Headphones')).toBe(false);
  });

  it('scores title similarity deterministically', () => {
    expect(titleSimilarity('Sony WH-1000XM5', 'Sony WH-1000XM5')).toBe(1);
    expect(titleSimilarity('Sony WH-1000XM5', 'Bose QuietComfort')).toBe(0);
    const partial = titleSimilarity(
      'Sony WH-1000XM5 Wireless Headphones',
      'Sony WH-1000XM5 Headphones',
    );
    expect(partial).toBeGreaterThan(0.5);
    expect(partial).toBeLessThan(1);
  });
});

describe('catalogue contracts', () => {
  const product = {
    id: 'sony-wh1000xm5',
    name: 'Sony WH-1000XM5 Wireless Headphones',
    brand: 'Sony',
    category: 'audio',
    specifications: {},
    variantOf: null,
    variantAttributes: {},
    imageUrls: [],
    status: 'active' as const,
    provenance: 'demo' as const,
    isSample: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  it('parses a canonical product and defaults optional collections', () => {
    const parsed = canonicalProductSchema.parse(product);
    expect(parsed.specifications).toEqual({});
    expect(parsed.imageUrls).toEqual([]);
    expect(parsed.variantOf).toBeNull();
  });

  it('rejects an invalid identifier instead of repairing it', () => {
    expect(gtinSchema.safeParse('4006381333932').success).toBe(false);
    expect(gtinSchema.safeParse(VALID_EAN_13).success).toBe(true);
    expect(canonicalProductSchema.safeParse({ ...product, gtin: '123' }).success).toBe(false);
  });

  it('rejects a canonical id that is not a slug', () => {
    expect(canonicalProductSchema.safeParse({ ...product, id: 'Sony XM5' }).success).toBe(false);
  });

  it('parses a listing and requires a match verdict', () => {
    const listing = {
      id: 'abc',
      canonicalProductId: null,
      sourceId: 'demo-catalog',
      marketplaceId: 'amazon',
      externalId: 'demo:amazon:sony-wh1000xm5',
      title: 'Sony WH-1000XM5',
      url: 'https://demo.saveshop.example/product/sony-wh1000xm5',
      specifications: {},
      provenance: 'demo' as const,
      isSample: true,
      match: {
        status: 'possible' as const,
        method: 'title_similarity' as const,
        confidence: 61,
        requiresReview: true,
        reasons: ['title similarity 0.62'],
      },
      lastObservedAt: '2026-01-01T00:00:00.000Z',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    expect(marketplaceListingSchema.safeParse(listing).success).toBe(true);
    expect(
      marketplaceListingSchema.safeParse({ ...listing, match: { status: 'possible' } }).success,
    ).toBe(false);
  });

  it('coerces and bounds search pagination', () => {
    const parsed = catalogueSearchQuerySchema.parse({ page: '2', pageSize: '24', q: ' sony ' });
    expect(parsed.page).toBe(2);
    expect(parsed.pageSize).toBe(24);
    expect(parsed.q).toBe('sony');
    expect(parsed.status).toBe('active');
    expect(catalogueSearchQuerySchema.safeParse({ pageSize: '500' }).success).toBe(false);
  });
});
