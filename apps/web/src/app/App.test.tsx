import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProductComparisonResponse } from '@smart-shopping/shared';

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

function mockComparison(body: unknown = comparisonPayload, init: ResponseInit = { status: 200 }) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: body }), {
        status: init.status,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
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
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    expect(screen.queryByText(/₹26,990/)).not.toBeInTheDocument();
  });

  it('rejects a comparison payload that violates the contract', async () => {
    mockComparison({ productId: 'sony-wh1000xm5', offers: 'not-an-array' });

    renderAt('/product/sony-wh1000xm5');

    expect(await screen.findByText(/did not match the agreed contract/i)).toBeInTheDocument();
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
