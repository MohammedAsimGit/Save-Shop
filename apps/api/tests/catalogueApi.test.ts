import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  catalogueProductResponseSchema,
  catalogueSearchResponseSchema,
  demoProducts,
  productListingsResponseSchema,
} from '@smart-shopping/shared';

import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { ensureCatalogueSeeded } from '../src/services/catalogue/index.js';

/**
 * Canonical catalogue read API.
 *
 * The catalogue is seeded once from the sample catalogue, exactly as a first run of
 * the server does, and every payload is validated against the shared contracts - a
 * response that drifts from the contract is a bug, not a rendering detail.
 */

const app = createApp();
const api = env.API_PREFIX;

beforeAll(async () => {
  await ensureCatalogueSeeded();
});

describe(`GET ${api}/products`, () => {
  it('returns a paginated, contract-valid catalogue page', async () => {
    const response = await request(app).get(`${api}/products`);

    expect(response.status).toBe(200);
    expect(catalogueSearchResponseSchema.safeParse(response.body.data).success).toBe(true);
    expect(response.body.data.products.length).toBeLessThanOrEqual(response.body.data.pageSize);
    expect(response.body.data.totalItems).toBe(demoProducts.length);
    expect(response.body.meta).toMatchObject({
      page: 1,
      pageSize: 12,
      totalItems: demoProducts.length,
    });
  });

  it('finds a product by name', async () => {
    const response = await request(app).get(`${api}/products?q=sony`);

    expect(response.status).toBe(200);
    const ids = (response.body.data.products as { id: string }[]).map((product) => product.id);
    expect(ids).toContain('sony-wh1000xm5');
    expect(response.body.data.notices.join(' ')).toMatch(/canonical product identity/i);
  });

  it('orders results by relevance', async () => {
    const response = await request(app).get(`${api}/products?q=iphone+15`);

    expect(response.status).toBe(200);
    expect(response.body.data.products[0].id).toBe('iphone-15-128');
  });

  it('filters by category', async () => {
    const response = await request(app).get(`${api}/products?category=phones&pageSize=48`);

    expect(response.status).toBe(200);
    const products = response.body.data.products as { category: string }[];
    expect(products.length).toBeGreaterThan(0);
    expect(products.every((product) => product.category === 'phones')).toBe(true);
  });

  it('paginates deterministically without repeating a product', async () => {
    const first = await request(app).get(`${api}/products?page=1&pageSize=2`);
    const second = await request(app).get(`${api}/products?page=2&pageSize=2`);

    const idsFirst = (first.body.data.products as { id: string }[]).map((product) => product.id);
    const idsSecond = (second.body.data.products as { id: string }[]).map((product) => product.id);

    expect(idsFirst).toHaveLength(2);
    expect(idsSecond).toHaveLength(2);
    expect(idsFirst.some((id) => idsSecond.includes(id))).toBe(false);
    expect(first.body.data.totalItems).toBe(second.body.data.totalItems);
  });

  it('returns an empty page with a notice when nothing matches', async () => {
    const response = await request(app).get(`${api}/products?q=zzzz-not-a-product`);

    expect(response.status).toBe(200);
    expect(response.body.data.products).toEqual([]);
    expect(response.body.data.totalItems).toBe(0);
    expect(response.body.data.notices.join(' ')).toMatch(/no canonical product matched/i);
  });

  it('rejects an out-of-range page size', async () => {
    const response = await request(app).get(`${api}/products?pageSize=500`);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details.join(' ')).toMatch(/pageSize/);
    expect(response.body.error.requestId).toBeTruthy();
  });
});

describe(`GET ${api}/products/:productId`, () => {
  it('returns the canonical product with its listing summary', async () => {
    const response = await request(app).get(`${api}/products/sony-wh1000xm5`);

    expect(response.status).toBe(200);
    expect(catalogueProductResponseSchema.safeParse(response.body.data).success).toBe(true);

    const data = response.body.data;
    expect(data.product.id).toBe('sony-wh1000xm5');
    expect(data.product.brand).toBe('Sony');
    expect(data.product.provenance).toBe('demo');
    expect(data.listingSummary.total).toBe(3);
    expect(data.listingSummary.resolved).toBe(3);
    expect(data.listingSummary.unresolved).toBe(0);
  });

  it('returns 404 for an unknown product', async () => {
    const response = await request(app).get(`${api}/products/ghost-product`);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('rejects a product id that is not a slug', async () => {
    const response = await request(app).get(`${api}/products/Sony%20XM5`);

    expect(response.status).toBe(400);
    expect(response.body.error.details.join(' ')).toMatch(/productId/);
  });
});

describe(`GET ${api}/products/:productId/listings`, () => {
  it('returns the resolved marketplace listings', async () => {
    const response = await request(app).get(`${api}/products/sony-wh1000xm5/listings`);

    expect(response.status).toBe(200);
    expect(productListingsResponseSchema.safeParse(response.body.data).success).toBe(true);

    const data = response.body.data;
    expect(data.listingSummary.total).toBe(3);
    expect(data.listings).toHaveLength(3);
    expect(
      data.listings.every((listing: { canonicalProductId: string }) => {
        return listing.canonicalProductId === 'sony-wh1000xm5';
      }),
    ).toBe(true);
    expect(data.listings.every((listing: { isSample: boolean }) => listing.isSample)).toBe(true);
    expect(data.listings[0].match.status).toBe('exact');
    // The storage-only change hash must never be part of the response.
    expect(data.listings[0]).not.toHaveProperty('contentHash');
  });
});

describe(`comparison and history still resolve canonical identity`, () => {
  it('compares the canonical product without changing the ranking contract', async () => {
    const response = await request(app).get(`${api}/products/sony-wh1000xm5/comparison`);

    expect(response.status).toBe(200);
    expect(response.body.data.product.id).toBe('sony-wh1000xm5');
    expect(response.body.data.status).toBe('sample_only');
    expect(response.body.data.offers.length).toBeGreaterThan(0);
    expect(response.body.data.notices.join(' ')).not.toMatch(/could not be resolved/i);
  });

  it('still serves history for a canonical product', async () => {
    const response = await request(app).get(`${api}/products/sony-wh1000xm5/history?period=30d`);

    expect(response.status).toBe(200);
    expect(response.body.data.product.id).toBe('sony-wh1000xm5');
    expect(response.body.data.product.title).toMatch(/Sony/i);
  });
});
