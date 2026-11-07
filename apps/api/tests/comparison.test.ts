import request from 'supertest';
import { describe, expect, it } from 'vitest';
import {
  demoProducts,
  lowestOffer,
  productComparisonResponseSchema,
  sourceCoverageResponseSchema,
} from '@smart-shopping/shared';

import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';

const app = createApp();
const product = demoProducts[0];

if (!product) throw new Error('demo catalogue is empty');

describe(`GET ${env.API_PREFIX}/products/:productId/comparison`, () => {
  it('returns a schema-valid comparison inside the success envelope', async () => {
    const response = await request(app).get(`${env.API_PREFIX}/products/${product.id}/comparison`);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/application\/json/);

    const parsed = productComparisonResponseSchema.safeParse(response.body.data);
    expect(parsed.success).toBe(true);
    expect(response.body.data.product.id).toBe(product.id);
    expect(response.body.data.currency).toBe('INR');
  });

  it('ranks cheapest first and identifies the lowest eligible offer', async () => {
    const response = await request(app).get(`${env.API_PREFIX}/products/${product.id}/comparison`);
    const { offers, lowest } = response.body.data as {
      offers: { price: { amountMinor: number }; isLowest: boolean; isVerified: boolean }[];
      lowest: { price: { amountMinor: number } } | null;
    };

    const amounts = offers.map((offer) => offer.price.amountMinor);
    expect(amounts).toEqual([...amounts].sort((a, b) => a - b));
    expect(lowest?.price.amountMinor).toBe(amounts[0]);
    expect(offers.filter((offer) => offer.isLowest)).toHaveLength(1);

    // The catalogue's cheapest in-stock offer is the oracle, not a hard-coded price.
    const expected = lowestOffer(product);
    expect(expected).toBeDefined();
    expect(lowest?.price.amountMinor).toBe(expected?.price.amountMinor);
  });

  it('labels the demo source as sample data and never as verified', async () => {
    const response = await request(app).get(`${env.API_PREFIX}/products/${product.id}/comparison`);
    const data = response.body.data;

    expect(data.status).toBe('sample_only');
    expect(data.lowestVerified).toBeNull();
    expect(data.notices.join(' ')).toMatch(/sample|demo/i);
    expect(data.offers.every((offer: { isVerified: boolean }) => offer.isVerified === false)).toBe(
      true,
    );
  });

  it('reports disabled marketplaces as awaiting permission rather than absent', async () => {
    const response = await request(app).get(`${env.API_PREFIX}/products/${product.id}/comparison`);
    const sources = response.body.data.sources as {
      id: string;
      enabled: boolean;
      permission: { status: string };
      disabledReason?: string;
    }[];

    const demo = sources.find((source) => source.id === 'demo-catalog');
    const amazon = sources.find((source) => source.id === 'amazon-in');
    const flipkart = sources.find((source) => source.id === 'flipkart-in');

    expect(demo?.enabled).toBe(true);
    expect(amazon?.enabled).toBe(false);
    expect(amazon?.permission.status).toBe('pending');
    expect(amazon?.disabledReason).toMatch(/written permission/i);
    expect(flipkart?.enabled).toBe(false);
  });

  it('is deterministic across repeated requests', async () => {
    const first = await request(app).get(`${env.API_PREFIX}/products/${product.id}/comparison`);
    const second = await request(app).get(`${env.API_PREFIX}/products/${product.id}/comparison`);

    expect(
      first.body.data.offers.map((offer: { marketplaceId: string }) => offer.marketplaceId),
    ).toEqual(
      second.body.data.offers.map((offer: { marketplaceId: string }) => offer.marketplaceId),
    );
    expect(first.body.data.lowest.price.amountMinor).toBe(
      second.body.data.lowest.price.amountMinor,
    );
  });

  it('returns 404 for an unknown product', async () => {
    const response = await request(app).get(`${env.API_PREFIX}/products/does-not-exist/comparison`);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
    expect(response.body.error.requestId).toBeTruthy();
  });

  it('rejects a malformed product id with field-level details', async () => {
    const response = await request(app).get(`${env.API_PREFIX}/products/NOT_A_SLUG/comparison`);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details.join(' ')).toMatch(/productId/);
  });
});

describe(`GET ${env.API_PREFIX}/sources`, () => {
  it('returns schema-valid coverage that admits what is not available', async () => {
    const response = await request(app).get(`${env.API_PREFIX}/sources`);

    expect(response.status).toBe(200);
    expect(sourceCoverageResponseSchema.safeParse(response.body.data).success).toBe(true);

    const notices = (response.body.data.notices as string[]).join(' ');
    expect(notices).toMatch(/demo catalogue/i);
    expect(notices).toMatch(/awaiting written permission/i);
  });

  it('keeps the request id correlation header', async () => {
    const response = await request(app).get(`${env.API_PREFIX}/sources`);

    expect(response.headers['x-request-id']).toMatch(/^[A-Za-z0-9._-]{8,128}$/);
  });
});
