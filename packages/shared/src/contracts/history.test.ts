import { describe, expect, it } from 'vitest';

import { marketSourceSchema } from './comparison.js';
import {
  HISTORY_PERIOD_DAYS,
  priceHistoryQuerySchema,
  priceHistoryResponseSchema,
} from './history.js';

const source = marketSourceSchema.parse({
  id: 'demo-catalog',
  displayName: 'SaveShop demo catalogue',
  kind: 'demo',
  verification: 'sample',
  attribution: { label: 'Invented sample prices, not marketplace data' },
  permission: { status: 'granted', permitsPriceAlerts: false },
  coverage: { countries: ['IN'], marketplaces: ['amazon'] },
  enabled: true,
});

const observation = {
  productId: 'sony-wh1000xm5',
  marketplaceId: 'amazon',
  sourceId: source.id,
  productUrl: 'https://demo.saveshop.example/product/sony-wh1000xm5',
  price: { amountMinor: 2699000, currency: 'INR' },
  availability: 'in_stock' as const,
  capturedAt: '2026-11-07T05:57:26.000Z',
  ttlSeconds: 3600,
  attribution: { label: 'Amazon India - invented sample price' },
  source,
  isSample: true,
  freshness: 'fresh' as const,
};

const response = {
  productId: 'sony-wh1000xm5',
  product: {
    id: 'sony-wh1000xm5',
    title: 'Sony WH-1000XM5 Wireless Headphones',
    brand: 'Sony',
    catalog: 'demo-catalog',
  },
  currency: 'INR',
  period: '30d' as const,
  from: '2026-10-08T05:57:26.000Z',
  to: '2026-11-07T05:57:26.000Z',
  generatedAt: '2026-11-07T05:57:26.000Z',
  status: 'sample_only' as const,
  observations: [observation],
  summary: {
    verified: { count: 0, lowest: null, latest: null },
    sample: {
      count: 1,
      lowest: {
        price: { amountMinor: 2699000, currency: 'INR' },
        capturedAt: '2026-11-07T05:57:26.000Z',
        marketplaceId: 'amazon',
        sourceId: source.id,
      },
      latest: {
        price: { amountMinor: 2699000, currency: 'INR' },
        capturedAt: '2026-11-07T05:57:26.000Z',
        marketplaceId: 'amazon',
        sourceId: source.id,
      },
    },
  },
  filters: { sourceId: null, marketplaceId: null, limit: 200 },
  notices: ['Sample observations are invented demo prices, not marketplace history.'],
};

describe('priceHistoryQuerySchema', () => {
  it('applies bounded defaults', () => {
    const parsed = priceHistoryQuerySchema.parse({});

    expect(parsed.period).toBe('30d');
    expect(parsed.limit).toBe(200);
    expect(parsed.sourceId).toBeUndefined();
  });

  it('coerces the limit from a query string and keeps the period closed', () => {
    const parsed = priceHistoryQuerySchema.parse({ period: '7d', limit: '25' });

    expect(parsed.period).toBe('7d');
    expect(parsed.limit).toBe(25);
    expect(() => priceHistoryQuerySchema.parse({ period: '365d' })).toThrow();
  });

  it('rejects limits outside the supported range', () => {
    expect(() => priceHistoryQuerySchema.parse({ limit: '0' })).toThrow();
    expect(() => priceHistoryQuerySchema.parse({ limit: '100000' })).toThrow();
  });

  it('exposes day counts for every accepted period', () => {
    expect(HISTORY_PERIOD_DAYS).toEqual({ '7d': 7, '30d': 30, '90d': 90 });
  });
});

describe('priceHistoryResponseSchema', () => {
  it('accepts a schema-shaped history response', () => {
    expect(priceHistoryResponseSchema.safeParse(response).success).toBe(true);
  });

  it('keeps sample and verified summaries separate', () => {
    const parsed = priceHistoryResponseSchema.parse(response);

    expect(parsed.summary.sample.count).toBe(1);
    expect(parsed.summary.verified.count).toBe(0);
    expect(parsed.summary.verified.lowest).toBeNull();
    expect(parsed.observations[0]?.isSample).toBe(true);
    expect(parsed.observations[0]?.source.verification).toBe('sample');
  });

  it('rejects a response with no separation between provenances', () => {
    const invalid = { ...response, summary: { sample: response.summary.sample } };

    expect(priceHistoryResponseSchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects a floating-point price in history', () => {
    const invalid = {
      ...response,
      observations: [{ ...observation, price: { amountMinor: 2699.5, currency: 'INR' } }],
    };

    expect(priceHistoryResponseSchema.safeParse(invalid).success).toBe(false);
  });
});
