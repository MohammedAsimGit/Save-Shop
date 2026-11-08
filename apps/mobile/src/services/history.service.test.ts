import { ApiError } from './apiClient';
import { fetchProductHistory } from './history.service';

const source = {
  id: 'demo-catalog',
  displayName: 'SaveShop demo catalogue',
  kind: 'demo',
  verification: 'sample',
  attribution: { label: 'Invented sample prices, not marketplace data' },
  permission: { status: 'granted', permitsPriceAlerts: false },
  coverage: { countries: ['IN'], marketplaces: ['amazon'] },
  enabled: true,
};

const observation = {
  productId: 'sony-wh1000xm5',
  marketplaceId: 'amazon',
  sourceId: 'demo-catalog',
  productUrl: 'https://demo.saveshop.example/product/sony-wh1000xm5',
  price: { amountMinor: 2_699_000, currency: 'INR' },
  availability: 'in_stock',
  capturedAt: '2026-11-06T09:55:00.000Z',
  ttlSeconds: 3600,
  attribution: { label: 'Amazon India - invented sample price' },
  source,
  isSample: true,
  freshness: 'fresh',
};

const validPayload = {
  productId: 'sony-wh1000xm5',
  product: {
    id: 'sony-wh1000xm5',
    title: 'Sony WH-1000XM5 Wireless Headphones',
    brand: 'Sony',
    catalog: 'demo-catalog',
  },
  currency: 'INR',
  period: '30d',
  from: '2026-10-07T10:00:00.000Z',
  to: '2026-11-06T10:00:00.000Z',
  generatedAt: '2026-11-06T10:00:00.000Z',
  status: 'sample_only',
  observations: [observation],
  summary: {
    verified: { count: 0, lowest: null, latest: null },
    sample: {
      count: 1,
      lowest: {
        price: observation.price,
        capturedAt: observation.capturedAt,
        marketplaceId: 'amazon',
        sourceId: 'demo-catalog',
      },
      latest: {
        price: observation.price,
        capturedAt: observation.capturedAt,
        marketplaceId: 'amazon',
        sourceId: 'demo-catalog',
      },
    },
  },
  filters: { sourceId: null, marketplaceId: null, limit: 200 },
  notices: ['Sample observations are invented demo prices, not marketplace history.'],
};

function mockFetch(payload: unknown) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ data: payload }),
  }) as unknown as typeof fetch;
}

describe('fetchProductHistory', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  it('accepts a contract-valid history and requests the selected period', async () => {
    mockFetch(validPayload);

    const history = await fetchProductHistory('sony-wh1000xm5', '90d');

    expect(history.status).toBe('sample_only');
    expect(history.observations).toHaveLength(1);
    expect(history.summary.verified.count).toBe(0);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/products/sony-wh1000xm5/history?period=90d'),
      expect.anything(),
    );
  });

  it('rejects a payload that violates the contract instead of plotting it', async () => {
    mockFetch({ ...validPayload, observations: 'not-an-array' });

    await expect(fetchProductHistory('sony-wh1000xm5', '30d')).rejects.toBeInstanceOf(ApiError);
    await expect(fetchProductHistory('sony-wh1000xm5', '30d')).rejects.toThrow(/contract/i);
  });

  it('rejects history that merges sample and verified summaries', async () => {
    mockFetch({ ...validPayload, summary: { sample: validPayload.summary.sample } });

    await expect(fetchProductHistory('sony-wh1000xm5', '30d')).rejects.toThrow(/contract/i);
  });

  it('defaults a missing rollups array and accepts archived daily summaries', async () => {
    mockFetch(validPayload);
    const withoutRollups = await fetchProductHistory('sony-wh1000xm5', '30d');
    expect(withoutRollups.rollups).toEqual([]);

    mockFetch({
      ...validPayload,
      rollups: [
        {
          productId: 'sony-wh1000xm5',
          sourceId: 'demo-catalog',
          marketplaceId: 'amazon',
          currency: 'INR',
          date: '2026-10-15',
          minPrice: { amountMinor: 2_499_000, currency: 'INR' },
          maxPrice: { amountMinor: 2_899_000, currency: 'INR' },
          firstPrice: { amountMinor: 2_899_000, currency: 'INR' },
          lastPrice: { amountMinor: 2_499_000, currency: 'INR' },
          observationCount: 6,
          availabilityCounts: { inStock: 5, outOfStock: 1, preorder: 0, unknown: 0 },
          sourceVerification: 'sample',
          isSample: true,
          generatedAt: '2026-11-01T00:00:00.000Z',
          aggregated: true,
          source,
        },
      ],
    });

    const withRollups = await fetchProductHistory('sony-wh1000xm5', '30d');
    expect(withRollups.rollups).toHaveLength(1);
    expect(withRollups.rollups[0]?.aggregated).toBe(true);
    expect(withRollups.rollups[0]?.observationCount).toBe(6);
  });
});
