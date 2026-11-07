import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';

import { demoProducts, priceHistoryResponseSchema } from '@smart-shopping/shared';

import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { snapshotStore } from '../src/services/snapshots/index.js';
import { createSourceRegistry } from '../src/services/sources/registry.js';

const app = createApp();
const registry = createSourceRegistry();

/** Fixtures are looked up, never hard-coded, so a catalogue edit fails loudly here. */
function require<T>(value: T | undefined, description: string): T {
  if (value === undefined) throw new Error(`Missing fixture: ${description}`);
  return value;
}

const sampleSource = require(registry.sources.find(
  (source) => source.verification === 'sample',
), 'an enabled sample source');
const seededProduct = require(demoProducts.find(
  (product) => product.id === 'sony-wh1000xm5',
), 'the seeded product');
const emptyProduct = require(demoProducts.find(
  (product) => product.id !== seededProduct.id,
), 'a second, unseeded product');

const SAMPLE_SOURCE_ID = sampleSource.id;

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 86_400_000);
}

async function seed(options: {
  readonly capturedAt: Date;
  readonly amountMinor: number;
  readonly marketplaceId?: string;
  readonly productId?: string;
}) {
  return snapshotStore.saveMany(
    [
      {
        productId: options.productId ?? seededProduct.id,
        marketplaceId: options.marketplaceId ?? 'amazon',
        sourceId: SAMPLE_SOURCE_ID,
        productUrl: `https://demo.saveshop.example/product/${options.productId ?? seededProduct.id}`,
        price: { amountMinor: options.amountMinor, currency: 'INR' },
        availability: 'in_stock',
        capturedAt: options.capturedAt.toISOString(),
        ttlSeconds: 3600,
        attribution: { label: 'Amazon India - invented sample price' },
      },
    ],
    { sources: registry.sources, now: new Date(), includeSampleSources: true },
  );
}

beforeAll(async () => {
  await seed({ capturedAt: daysAgo(40), amountMinor: 3_200_000 });
  await seed({ capturedAt: daysAgo(20), amountMinor: 3_000_000 });
  await seed({ capturedAt: daysAgo(3), amountMinor: 2_800_000 });
  await seed({ capturedAt: daysAgo(2), amountMinor: 2_700_000, marketplaceId: 'flipkart' });
  await seed({ capturedAt: daysAgo(1), amountMinor: 2_750_000 });
});

describe(`GET ${env.API_PREFIX}/products/:productId/history`, () => {
  it('returns a schema-valid, chronologically ordered history', async () => {
    const response = await request(app).get(
      `${env.API_PREFIX}/products/${seededProduct.id}/history?period=90d`,
    );

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(priceHistoryResponseSchema.safeParse(response.body.data).success).toBe(true);

    const observed = response.body.data.observations as { capturedAt: string }[];
    const timestamps = observed.map((observation) => Date.parse(observation.capturedAt));
    expect(timestamps).toEqual([...timestamps].sort((a, b) => a - b));
    expect(observed).toHaveLength(5);
  });

  it('separates sample history from verified history and labels it demo', async () => {
    const response = await request(app).get(
      `${env.API_PREFIX}/products/${seededProduct.id}/history?period=90d`,
    );
    const data = response.body.data;

    expect(data.status).toBe('sample_only');
    expect(data.summary.sample.count).toBe(5);
    expect(data.summary.verified.count).toBe(0);
    expect(data.summary.verified.lowest).toBeNull();
    expect(
      data.observations.every(
        (observation: { isSample: boolean }) => observation.isSample === true,
      ),
    ).toBe(true);
    expect(data.notices.join(' ')).toMatch(/invented demo prices/i);
  });

  it('reports the lowest and latest observed price for the period', async () => {
    const response = await request(app).get(
      `${env.API_PREFIX}/products/${seededProduct.id}/history?period=7d`,
    );
    const summary = response.body.data.summary.sample;

    // 40d and 20d observations must not leak into a 7d window.
    expect(summary.count).toBe(3);
    expect(summary.lowest.price.amountMinor).toBe(2_700_000);
    expect(summary.lowest.marketplaceId).toBe('flipkart');
    expect(summary.latest.price.amountMinor).toBe(2_750_000);
  });

  it('filters by marketplace', async () => {
    const response = await request(app).get(
      `${env.API_PREFIX}/products/${seededProduct.id}/history?period=7d&marketplaceId=flipkart`,
    );

    expect(response.body.data.observations).toHaveLength(1);
    expect(response.body.data.filters.marketplaceId).toBe('flipkart');
    expect(response.body.data.observations[0].marketplaceId).toBe('flipkart');
  });

  it('filters by source', async () => {
    const response = await request(app).get(
      `${env.API_PREFIX}/products/${seededProduct.id}/history?period=90d&sourceId=${SAMPLE_SOURCE_ID}`,
    );

    expect(response.body.data.observations).toHaveLength(5);
    expect(response.body.data.filters.sourceId).toBe(SAMPLE_SOURCE_ID);

    const unknown = await request(app).get(
      `${env.API_PREFIX}/products/${seededProduct.id}/history?sourceId=not-registered`,
    );
    expect(unknown.status).toBe(200);
    expect(unknown.body.data.status).toBe('no_history');
    expect(unknown.body.data.observations).toEqual([]);
  });

  it('honours the limit by returning the most recent observations', async () => {
    const response = await request(app).get(
      `${env.API_PREFIX}/products/${seededProduct.id}/history?period=90d&limit=2`,
    );

    const observations = response.body.data.observations as { capturedAt: string }[];
    expect(observations).toHaveLength(2);
    expect(Date.parse(observations[1]?.capturedAt ?? '')).toBeGreaterThan(
      Date.parse(observations[0]?.capturedAt ?? ''),
    );
    expect(response.body.data.notices.join(' ')).toMatch(/most recent 2 observations/i);
  });

  it('returns an empty, honest history for a product nothing was stored for', async () => {
    const response = await request(app).get(
      `${env.API_PREFIX}/products/${emptyProduct.id}/history`,
    );

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('no_history');
    expect(response.body.data.observations).toEqual([]);
    expect(response.body.data.summary.sample.lowest).toBeNull();
    expect(response.body.data.notices.join(' ')).toMatch(/no stored observation/i);
    expect(priceHistoryResponseSchema.safeParse(response.body.data).success).toBe(true);
  });

  it('rejects an unsupported period with field-level details', async () => {
    const response = await request(app).get(
      `${env.API_PREFIX}/products/${seededProduct.id}/history?period=365d`,
    );

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details.join(' ')).toMatch(/period/);
    expect(response.body.error.requestId).toBeTruthy();
  });

  it('rejects an out-of-range limit and a malformed product id', async () => {
    const badLimit = await request(app).get(
      `${env.API_PREFIX}/products/${seededProduct.id}/history?limit=0`,
    );
    expect(badLimit.status).toBe(400);
    expect(badLimit.body.error.details.join(' ')).toMatch(/limit/);

    const badId = await request(app).get(`${env.API_PREFIX}/products/NOT_A_SLUG/history`);
    expect(badId.status).toBe(400);
    expect(badId.body.error.details.join(' ')).toMatch(/productId/);
  });

  it('returns 404 for an unknown product and keeps the request id', async () => {
    const response = await request(app).get(`${env.API_PREFIX}/products/ghost-product/history`);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
    expect(response.headers['x-request-id']).toMatch(/^[A-Za-z0-9._-]{8,128}$/);
  });
});
