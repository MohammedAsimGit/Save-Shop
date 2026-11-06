import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

  it('marks the cheapest in-stock offer on the product page', () => {
    renderAt('/product/sony-wh1000xm5');

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Sony WH-1000XM5/i);
    // Exactly one offer earns the "Lowest" label.
    expect(screen.getAllByText('Lowest')).toHaveLength(1);
    expect(screen.getAllByText(/Amazon India/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Out of stock/i)).toBeInTheDocument();
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
