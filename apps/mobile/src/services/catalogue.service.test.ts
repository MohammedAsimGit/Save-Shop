import { ApiError } from './apiClient';
import { fetchCatalogueProducts, fetchProductIdentity } from './catalogue.service';

const product = {
  id: 'sony-wh1000xm5',
  name: 'Sony WH-1000XM5 Wireless Headphones',
  brand: 'Sony',
  category: 'audio',
  specifications: {},
  variantOf: null,
  variantAttributes: {},
  imageUrls: [],
  status: 'active',
  provenance: 'demo',
  isSample: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const searchPayload = {
  query: { q: 'sony', brand: null, category: null, model: null },
  products: [product],
  page: 1,
  pageSize: 12,
  totalItems: 1,
  ordering: 'relevance',
  notices: ['Matches are against canonical product identity.'],
};

const identityPayload = {
  product,
  listingSummary: {
    total: 3,
    resolved: 3,
    unresolved: 0,
    requiresReview: 0,
    byStatus: { exact: 3, strong: 0, possible: 0, unmatched: 0, conflict: 0 },
  },
  notices: [],
};

function mockFetch(payload: unknown) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ data: payload }),
  }) as unknown as typeof fetch;
}

describe('catalogue API client', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  it('accepts a contract-valid catalogue page', async () => {
    mockFetch(searchPayload);

    const result = await fetchCatalogueProducts({ q: 'sony' });

    expect(result.products[0]?.id).toBe('sony-wh1000xm5');
    expect(result.ordering).toBe('relevance');
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/products?q=sony'),
      expect.anything(),
    );
  });

  it('rejects a catalogue response that violates the contract', async () => {
    mockFetch({ ...searchPayload, products: 'not-an-array' });

    await expect(fetchCatalogueProducts({ q: 'sony' })).rejects.toBeInstanceOf(ApiError);
    await expect(fetchCatalogueProducts({ q: 'sony' })).rejects.toThrow(/contract/i);
  });

  it('accepts a contract-valid identity payload', async () => {
    mockFetch(identityPayload);

    const identity = await fetchProductIdentity('sony-wh1000xm5');

    expect(identity.product.name).toMatch(/Sony/i);
    expect(identity.listingSummary.resolved).toBe(3);
  });

  it('rejects identity with an invalid listing summary', async () => {
    mockFetch({ ...identityPayload, listingSummary: { total: 3 } });

    await expect(fetchProductIdentity('sony-wh1000xm5')).rejects.toThrow(/contract/i);
  });
});
