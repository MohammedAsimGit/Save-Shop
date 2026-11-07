import { ApiError } from './apiClient';
import { fetchProductComparison } from './comparison.service';

const source = {
  id: 'demo-catalog',
  displayName: 'SaveShop demo catalogue',
  kind: 'demo',
  verification: 'sample',
  attribution: { label: 'Invented sample prices, not marketplace data' },
  permission: { status: 'granted', permitsPriceAlerts: false },
  coverage: { countries: ['IN'], marketplaces: ['amazon-in'] },
  enabled: true,
};

const offer = {
  productId: 'sony-wh1000xm5',
  marketplaceId: 'amazon-in',
  sourceId: 'demo-catalog',
  productUrl: 'https://demo.saveshop.example/product/sony-wh1000xm5',
  price: { amountMinor: 2_699_000, currency: 'INR' },
  availability: 'in_stock',
  capturedAt: '2026-11-06T09:55:00.000Z',
  ttlSeconds: 3600,
  attribution: { label: 'Amazon India - invented sample price' },
  source,
  freshness: 'fresh',
  isLowest: true,
  isVerified: false,
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
  generatedAt: '2026-11-06T10:00:00.000Z',
  lowest: offer,
  lowestVerified: null,
  offers: [offer],
  excluded: [],
  status: 'sample_only',
  sources: [source],
  notices: ['Demo source: invented prices.'],
};

function mockFetch(payload: unknown) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ data: payload }),
  }) as unknown as typeof fetch;
}

describe('fetchProductComparison', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  it('accepts a contract-valid comparison', async () => {
    mockFetch(validPayload);

    const comparison = await fetchProductComparison('sony-wh1000xm5');

    expect(comparison.status).toBe('sample_only');
    expect(comparison.lowest?.price.amountMinor).toBe(2_699_000);
    expect(comparison.lowestVerified).toBeNull();
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/products/sony-wh1000xm5/comparison'),
      expect.anything(),
    );
  });

  it('rejects a payload that violates the contract instead of rendering it', async () => {
    mockFetch({ ...validPayload, offers: 'not-an-array' });

    await expect(fetchProductComparison('sony-wh1000xm5')).rejects.toBeInstanceOf(ApiError);
    await expect(fetchProductComparison('sony-wh1000xm5')).rejects.toThrow(/contract/i);
  });

  it('rejects a price expressed as a float', async () => {
    mockFetch({
      ...validPayload,
      offers: [{ ...offer, price: { amountMinor: 2699.5, currency: 'INR' } }],
      lowest: { ...offer, price: { amountMinor: 2699.5, currency: 'INR' } },
    });

    await expect(fetchProductComparison('sony-wh1000xm5')).rejects.toThrow(/contract/i);
  });
});
