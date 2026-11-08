import { useEffect, useState } from 'react';

import type { CatalogueSearchResponse } from '@smart-shopping/shared';

import { ApiError } from '../lib/apiClient';
import { fetchCatalogueProducts, type CatalogueSearchParams } from '../services/catalogue.service';

export type CatalogueSearchState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly result: CatalogueSearchResponse }
  | { readonly status: 'error'; readonly message: string; readonly isNetworkError: boolean };

/**
 * Loads canonical products for the search page.
 *
 * The canonical catalogue is the source of truth for *which* products exist. When it
 * cannot be reached, the search page falls back to the local sample catalogue - the
 * same behaviour it had before this sprint - and says so. The fallback is explicit
 * because silently searching a different catalogue would be misleading.
 */
export function useCatalogueSearch(params: CatalogueSearchParams): {
  state: CatalogueSearchState;
  retry: () => void;
} {
  const [state, setState] = useState<CatalogueSearchState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  const query = params.q ?? '';
  const brand = params.brand ?? '';
  const category = params.category ?? '';
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 24;

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    setState({ status: 'loading' });

    fetchCatalogueProducts(
      {
        ...(query ? { q: query } : {}),
        ...(brand ? { brand } : {}),
        ...(category ? { category } : {}),
        page,
        pageSize,
      },
      { signal: controller.signal },
    )
      .then((result) => {
        if (!cancelled) setState({ status: 'ready', result });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState({
          status: 'error',
          message: error instanceof Error ? error.message : 'Unknown error',
          isNetworkError: error instanceof ApiError && error.isNetworkError,
        });
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [query, brand, category, page, pageSize, attempt]);

  return { state, retry: () => setAttempt((value) => value + 1) };
}
