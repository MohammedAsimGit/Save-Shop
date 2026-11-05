import { render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { routes } from './routes';

const healthPayload = {
  status: 'ok',
  service: 'smart-shopping-api',
  version: '0.1.0',
  environment: 'test',
  uptimeSeconds: 3,
  timestamp: '2026-01-01T00:00:00.000Z',
  checks: { database: { status: 'not_configured' } },
};

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return render(<RouterProvider router={router} />);
}

function mockFetchOnce(body: unknown, init: ResponseInit = { status: 200 }) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify(body), {
        status: init.status,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  );
}

describe('web shell', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the Sprint 0 placeholder and reports API health', async () => {
    mockFetchOnce({ data: healthPayload });

    renderAt('/');

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      /platform skeleton is running/i,
    );
    await waitFor(() => expect(screen.getByText(/Healthy/i)).toBeInTheDocument());
    expect(screen.getByText('not_configured')).toBeInTheDocument();
    // Sprint 0 must never present fabricated commerce data.
    expect(screen.getByText(/No prices are fabricated/i)).toBeInTheDocument();
  });

  it('explains how to start the API when it is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connection refused')));

    renderAt('/');

    await waitFor(() => expect(screen.getByText(/Start the API with/i)).toBeInTheDocument());
    expect(screen.getByText(/Unreachable/i)).toBeInTheDocument();
  });

  it('renders the 404 page for unknown routes', async () => {
    mockFetchOnce({ data: healthPayload });

    renderAt('/does-not-exist');

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/does not exist/i);
  });
});
