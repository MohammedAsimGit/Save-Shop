import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PriceHistoryResponse, ProductComparisonResponse } from '@smart-shopping/shared';

import { ThemeProvider } from '../theme/ThemeProvider';
import { routes } from './routes';

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return render(
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>,
  );
}

const demosource = {
  id: 'demo-catalog',
  displayName: 'SaveShop demo catalogue',
  kind: 'demo' as const,
  verification: 'sample' as const,
  attribution: { label: 'Invented sample prices, not marketplace data' },
  permission: {
    status: 'granted' as const,
    note: 'Local sample data.',
    permitsPriceAlerts: false,
  },
  coverage: { countries: ['IN'], marketplaces: ['amazon-in'] },
  enabled: true,
};

const amazonPending = {
  id: 'amazon-in',
  displayName: 'Amazon India',
  kind: 'marketplace_api' as const,
  verification: 'verified' as const,
  attribution: { label: 'Amazon India' },
  permission: {
    status: 'pending' as const,
    note: 'Written approval required.',
    permitsPriceAlerts: false,
  },
  coverage: { countries: ['IN'], marketplaces: ['amazon-in'] },
  enabled: false,
  disabledReason: 'No written permission for comparison use.',
};

const offer = {
  productId: 'sony-wh1000xm5',
  marketplaceId: 'amazon-in',
  sourceId: 'demo-catalog',
  productUrl: 'https://demo.saveshop.example/product/sony-wh1000xm5',
  price: { amountMinor: 2_699_000, currency: 'INR' },
  availability: 'in_stock' as const,
  capturedAt: '2026-11-06T09:55:00.000Z',
  ttlSeconds: 3600,
  attribution: { label: 'Amazon India - invented sample price' },
  source: demosource,
  freshness: 'fresh' as const,
  isLowest: true,
  isVerified: false,
};

const comparisonPayload: ProductComparisonResponse = {
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
  excluded: [{ reason: 'unavailable', snapshot: null }],
  status: 'sample_only',
  sources: [demosource, amazonPending],
  notices: ['Demo source: prices are generated sample values, not marketplace observations.'],
};

const historyObservation = {
  productId: 'sony-wh1000xm5',
  marketplaceId: 'amazon',
  sourceId: 'demo-catalog',
  productUrl: 'https://demo.saveshop.example/product/sony-wh1000xm5',
  price: { amountMinor: 2_899_000, currency: 'INR' },
  availability: 'in_stock' as const,
  capturedAt: '2026-11-03T09:55:00.000Z',
  ttlSeconds: 3600,
  attribution: { label: 'Amazon India - invented sample price' },
  source: demosource,
  isSample: true,
  freshness: 'stale' as const,
};

const historyPayload: PriceHistoryResponse = {
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
  observations: [
    historyObservation,
    {
      ...historyObservation,
      price: { amountMinor: 2_699_000, currency: 'INR' },
      capturedAt: '2026-11-06T09:55:00.000Z',
      freshness: 'fresh',
    },
  ],
  summary: {
    verified: { count: 0, lowest: null, latest: null },
    sample: {
      count: 2,
      lowest: {
        price: { amountMinor: 2_699_000, currency: 'INR' },
        capturedAt: '2026-11-06T09:55:00.000Z',
        marketplaceId: 'amazon',
        sourceId: 'demo-catalog',
      },
      latest: {
        price: { amountMinor: 2_699_000, currency: 'INR' },
        capturedAt: '2026-11-06T09:55:00.000Z',
        marketplaceId: 'amazon',
        sourceId: 'demo-catalog',
      },
    },
  },
  rollups: [],
  filters: { sourceId: null, marketplaceId: null, limit: 200 },
  notices: ['Sample observations are invented demo prices, not marketplace history.'],
};

/** One archived day: an aggregate, which the UI must never plot as a price point. */
const archivedRollup = {
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
  sourceVerification: 'sample' as const,
  isSample: true,
  generatedAt: '2026-11-01T00:00:00.000Z',
  aggregated: true as const,
  source: demosource,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify({ data: body }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const fetchMock = { calls: [] as string[] };

/** Routes comparison and history requests separately, and records the URLs. */
function mockComparison(body: unknown = comparisonPayload, history: unknown = historyPayload) {
  fetchMock.calls = [];

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      fetchMock.calls.push(url);
      return url.includes('/history') ? jsonResponse(history) : jsonResponse(body);
    }),
  );
}

describe('SaveShop web interface', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    document.documentElement.dataset.theme = 'light';
  });

  it('renders the landing page with an honest sample-data disclosure', () => {
    renderAt('/');

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/find the real price/i);
    expect(screen.getAllByText(/invented, not live marketplace prices/i).length).toBeGreaterThan(0);
    expect(screen.getByRole('search', { name: 'Product search' })).toBeInTheDocument();
  });

  it('carries a search query into the results page and filters the catalogue', async () => {
    renderAt('/');

    const input = screen.getByPlaceholderText('Search products, brands or categories');
    fireEvent.change(input, { target: { value: 'iphone' } });
    fireEvent.submit(input.closest('form') as HTMLFormElement);

    expect(
      await screen.findByRole('heading', { name: /results for "iphone"/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Apple iPhone 15/i)).toBeInTheDocument();
    expect(screen.queryByText(/Sony WH-1000XM5/i)).not.toBeInTheDocument();
  });

  it('renders the API comparison with its source, freshness and demo labelling', async () => {
    mockComparison();

    renderAt('/product/sony-wh1000xm5');

    expect(await screen.findByText(/lowest sample price/i)).toBeInTheDocument();
    // The headline price and the offer row both show it; neither is hard-coded by the view.
    expect(screen.getAllByText(/₹26,990/).length).toBeGreaterThan(0);
    // Exactly one offer earns the "Lowest" badge.
    expect(screen.getAllByText('Lowest')).toHaveLength(1);
    expect(screen.getAllByText('Demo').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/SaveShop demo catalogue/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/observed/i).length).toBeGreaterThan(0);
    // Coverage is reported, including what is still blocked.
    expect(screen.getByText(/No written permission for comparison use/i)).toBeInTheDocument();
    // Excluded observations are counted rather than silently dropped.
    expect(screen.getByText(/1 out of stock/i)).toBeInTheDocument();
  });

  it('says the comparison is unavailable instead of falling back to sample prices', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connection refused')));

    renderAt('/product/sony-wh1000xm5');

    expect(await screen.findByText(/comparison unavailable/i)).toBeInTheDocument();
    // Both the comparison and the history section offer their own retry.
    expect(screen.getAllByRole('button', { name: /retry/i }).length).toBeGreaterThan(0);
    expect(screen.queryByText(/₹26,990/)).not.toBeInTheDocument();
  });

  it('rejects a comparison payload that violates the contract', async () => {
    mockComparison({ productId: 'sony-wh1000xm5', offers: 'not-an-array' });

    renderAt('/product/sony-wh1000xm5');

    expect(await screen.findByText(/did not match the agreed contract/i)).toBeInTheDocument();
  });

  it('renders stored demo history with its period, sources and demo labelling', async () => {
    mockComparison();

    renderAt('/product/sony-wh1000xm5');

    expect(await screen.findByRole('heading', { name: 'Price history' })).toBeInTheDocument();
    expect(await screen.findByText('Demo observations')).toBeInTheDocument();
    expect(screen.getByText(/Lowest demo price/i)).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: /demo sample price observations over 30 days/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/2 stored observations/i)).toBeInTheDocument();
    expect(screen.getAllByText(/invented demo prices/i).length).toBeGreaterThan(0);
  });

  it('refetches history when a different period is selected', async () => {
    mockComparison();

    renderAt('/product/sony-wh1000xm5');
    await screen.findByRole('heading', { name: 'Price history' });

    fireEvent.click(screen.getByRole('button', { name: '7 days' }));

    await waitFor(() =>
      expect(fetchMock.calls.some((url) => url.includes('/history?period=7d'))).toBe(true),
    );
    expect(screen.getByRole('button', { name: '7 days' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('reports an empty history instead of inventing a trend', async () => {
    mockComparison(comparisonPayload, {
      ...historyPayload,
      status: 'no_history',
      observations: [],
      summary: {
        verified: { count: 0, lowest: null, latest: null },
        sample: { count: 0, lowest: null, latest: null },
      },
      notices: ['No stored observation for this product in the last 30 days.'],
    });

    renderAt('/product/sony-wh1000xm5');

    expect(
      await screen.findByText(/no stored observation in the last 30 days/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /price observations over/i })).not.toBeInTheDocument();
  });

  it('keeps demo points out of a chart that has verified observations', async () => {
    const verifiedObservation = {
      ...historyObservation,
      sourceId: 'amazon-in',
      marketplaceId: 'amazon',
      isSample: false,
      source: amazonPending,
      capturedAt: '2026-11-05T09:55:00.000Z',
    };

    mockComparison(comparisonPayload, {
      ...historyPayload,
      status: 'mixed',
      observations: [historyObservation, verifiedObservation],
      summary: {
        verified: {
          count: 1,
          lowest: {
            price: verifiedObservation.price,
            capturedAt: verifiedObservation.capturedAt,
            marketplaceId: 'amazon',
            sourceId: 'amazon-in',
          },
          latest: {
            price: verifiedObservation.price,
            capturedAt: verifiedObservation.capturedAt,
            marketplaceId: 'amazon',
            sourceId: 'amazon-in',
          },
        },
        sample: {
          count: 1,
          lowest: {
            price: historyObservation.price,
            capturedAt: historyObservation.capturedAt,
            marketplaceId: 'amazon',
            sourceId: 'demo-catalog',
          },
          latest: {
            price: historyObservation.price,
            capturedAt: historyObservation.capturedAt,
            marketplaceId: 'amazon',
            sourceId: 'demo-catalog',
          },
        },
      },
    });

    renderAt('/product/sony-wh1000xm5');

    expect(await screen.findByText('Verified observations')).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: /verified price observations over 30 days/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/excluded from this chart/i)).toBeInTheDocument();
  });

  it('lists archived daily summaries without charting them as price points', async () => {
    mockComparison(comparisonPayload, { ...historyPayload, rollups: [archivedRollup] });

    renderAt('/product/sony-wh1000xm5');

    expect(await screen.findByText('Archived daily summaries')).toBeInTheDocument();
    expect(screen.getByText(/Daily aggregate/i)).toBeInTheDocument();
    expect(screen.getByText(/not point-in-time marketplace prices/i)).toBeInTheDocument();
    // Min/last and max/first share a value in this fixture, so each renders twice.
    expect(screen.getAllByText('₹24,990').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('₹28,990').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText(/Observations/).length).toBeGreaterThan(0);
    // The chart still describes the two point observations, not the aggregate.
    expect(screen.getByText(/2 stored observations/i)).toBeInTheDocument();
  });

  it('shows archived days when a window has no full-resolution observations left', async () => {
    mockComparison(comparisonPayload, {
      ...historyPayload,
      status: 'sample_only',
      observations: [],
      rollups: [archivedRollup],
      summary: {
        verified: { count: 0, lowest: null, latest: null },
        sample: { count: 0, lowest: null, latest: null },
      },
      notices: [
        'Raw observations for this window were compacted; 1 archived daily summary is shown instead.',
      ],
    });

    renderAt('/product/sony-wh1000xm5');

    expect(await screen.findByText(/no full-resolution observation/i)).toBeInTheDocument();
    expect(screen.getByText('Archived daily summaries')).toBeInTheDocument();
    expect(screen.getByText(/compacted into the daily summaries below/i)).toBeInTheDocument();
    // Nothing is drawn from the aggregate.
    expect(screen.queryByRole('img', { name: /price observations over/i })).not.toBeInTheDocument();
  });

  it('switches to the dark theme and remembers the choice', async () => {
    renderAt('/profile');

    fireEvent.click(screen.getByRole('button', { name: 'Dark' }));

    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'));
    expect(localStorage.getItem('saveshop-theme')).toBe('dark');
  });

  it('renders the 404 page for unknown routes', () => {
    renderAt('/does-not-exist');

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/does not exist/i);
  });
});
