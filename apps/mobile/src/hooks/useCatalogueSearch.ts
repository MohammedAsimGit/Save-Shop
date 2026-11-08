import { useEffect, useState } from 'react';

import type { CatalogueSearchResponse } from '@smart-shopping/shared';

import { ApiError } from '../services/apiClient';
import {
  fetchCatalogueProducts,
  type MobileCatalogueSearchParams,
} from '../services/catalogue.service';

export type CatalogueSearchState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly result: CatalogueSearchResponse }
  | { readonly status: 'error'; readonly message: string; readonly isNetworkError: boolean };

/**
 * Loads canonical products for the search screen.
 *
 * The canonical catalogue decides which products exist. When it cannot be reached
 * the screen keeps its previous behaviour - searching the local sample catalogue -
 * and says so, rather than silently searching a different catalogue.
 */
export function useCatalogueSearch(params: MobileCatalogueSearchParams): {
  state: CatalogueSearchState;
  retry: () => void;
} {
  const [state, setState] = useState<CatalogueSearchState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  const query = params.q ?? '';
  const category = params.category ?? '';
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 12;

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });

    fetchCatalogueProducts({
      ...(query ? { q: query } : {}),
      ...(category ? { category } : {}),
      page,
      pageSize,
    })
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
    };
  }, [query, category, page, pageSize, attempt]);

  return { state, retry: () => setAttempt((value) => value + 1) };
}
