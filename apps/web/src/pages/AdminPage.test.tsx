import '@testing-library/jest-dom/vitest';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ThemeProvider } from '../theme/ThemeProvider';
import { AdminPage } from './AdminPage';

/**
 * Admin UI behaviour.
 *
 * These tests cover the presentation gate and the queue rendering; they do not and
 * cannot prove authorization, which is enforced by the API and tested there.
 */

function renderAdmin() {
  const router = createMemoryRouter([{ path: '/admin', element: <AdminPage /> }], {
    initialEntries: ['/admin'],
  });
  return render(
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>,
  );
}

function jsonResponse(body: unknown): Promise<Response> {
  return Promise.resolve({ ok: true, status: 200, json: async () => body } as Response);
}

const LISTING = {
  id: 'listing-1',
  canonicalProductId: null,
  sourceId: 'demo-catalog',
  marketplaceId: 'amazon-in',
  externalId: 'sku-1',
  title: 'Sony WH-1000XM5 Wireless Headphones',
  url: 'https://demo.saveshop.example/product/sony-wh1000xm5',
  brand: 'Sony',
  specifications: {},
  provenance: 'manual',
  isSample: true,
  match: {
    status: 'possible',
    method: 'title_similarity',
    confidence: 72,
    requiresReview: true,
    reasons: ['title similarity 0.86 with the same brand'],
  },
  revision: 0,
  review: null,
  lastObservedAt: '2026-11-09T09:00:00.000Z',
  createdAt: '2026-11-09T09:00:00.000Z',
  updatedAt: '2026-11-09T09:00:00.000Z',
} as const;

const QUEUE_ITEM = {
  listing: LISTING,
  candidates: [
    {
      productId: 'sony-wh1000xm5',
      name: 'WH-1000XM5 Wireless Headphones',
      brand: 'Sony',
      category: 'audio',
      status: 'possible',
      method: 'title_similarity',
      confidence: 72,
      reasons: ['title similarity 0.86 with the same brand'],
      isSample: true,
      mergedInto: null,
    },
  ],
  conflicts: [],
  reviewRequiredReason:
    'The automatic matcher found more than one plausible product; a human must choose.',
  pending: true,
} as const;

const QUEUE = {
  items: [QUEUE_ITEM],
  page: 1,
  pageSize: 20,
  totalItems: 1,
  counts: {
    pending: 1,
    decided: 0,
    requiresReview: 1,
    byVerdict: { exact: 0, strong: 0, possible: 1, unmatched: 0, conflict: 0 },
  },
  notices: ['Matching strength is a deterministic 0-100 score, not a probability.'],
} as const;

const DETAIL = {
  item: QUEUE_ITEM,
  decisions: [],
  audit: [],
  notices: [],
} as const;

const PROFILE = {
  id: 'admin-1',
  email: 'ops@example.com',
  displayName: 'Operations',
  role: 'catalogue_admin',
  status: 'active',
  createdAt: '2026-11-01T00:00:00.000Z',
  lastLoginAt: '2026-11-09T09:00:00.000Z',
} as const;

describe('admin page', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.sessionStorage.clear();
  });

  it('shows the sign-in gate instead of the queue when there is no session', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    renderAdmin();

    expect(screen.getByRole('heading', { name: /catalogue administration/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/administrator email/i)).toBeInTheDocument();
    expect(screen.queryByText(/nothing waiting for review/i)).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('loads the queue and detail for an existing session', async () => {
    window.sessionStorage.setItem('saveshop.admin.token', 'test-token');

    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/admin/auth/me')) return jsonResponse({ data: PROFILE });
      if (url.includes('/admin/catalogue/review-queue')) return jsonResponse({ data: QUEUE });
      if (url.includes('/admin/catalogue/listings/')) return jsonResponse({ data: DETAIL });
      return Promise.reject(new Error(`Unexpected request: ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    renderAdmin();

    await waitFor(() => {
      // The title appears in the queue row and again in the detail header.
      expect(screen.getAllByText('Sony WH-1000XM5 Wireless Headphones').length).toBeGreaterThan(0);
    });

    expect(screen.getByRole('heading', { name: /match review/i })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /accept selected/i })).toBeEnabled();
    });

    const queueCall = fetchMock.mock.calls.find(([input]) =>
      String(input).includes('/review-queue'),
    );
    expect(queueCall?.[1]).toMatchObject({
      headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
    });
  });

  it('clears the session when signing out', async () => {
    window.sessionStorage.setItem('saveshop.admin.token', 'test-token');

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith('/admin/auth/me')) return jsonResponse({ data: PROFILE });
        if (url.includes('/admin/catalogue/review-queue')) return jsonResponse({ data: QUEUE });
        return jsonResponse({ data: DETAIL });
      }),
    );

    renderAdmin();

    const signOut = await screen.findByRole('button', { name: /sign out/i });
    fireEvent.click(signOut);

    expect(window.sessionStorage.getItem('saveshop.admin.token')).toBeNull();
    expect(screen.getByLabelText(/administrator email/i)).toBeInTheDocument();
  });
});
