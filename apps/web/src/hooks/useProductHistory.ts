import { useCallback, useEffect, useState } from 'react';

import type { HistoryPeriod, PriceHistoryResponse } from '@smart-shopping/shared';

import { ApiError } from '../lib/apiClient';
import { fetchProductHistory } from '../services/history.service';

export type ProductHistoryState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly history: PriceHistoryResponse }
  | { readonly status: 'error'; readonly message: string; readonly isNetworkError: boolean };

/**
 * Loads the stored history for one product and period.
 *
 * Changing the period refetches; there is no client-side point caching, because
 * history is cheap to read and a stale window would be a correctness bug in a
 * chart. Aborts in-flight requests on unmount or period change.
 */
export function useProductHistory(
  productId: string | undefined,
  period: HistoryPeriod,
): { state: ProductHistoryState; retry: () => void } {
  const [state, setState] = useState<ProductHistoryState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!productId) {
      setState({ status: 'error', message: 'No product was requested', isNetworkError: false });
      return;
    }

    const controller = new AbortController();
    let cancelled = false;
    setState({ status: 'loading' });

    fetchProductHistory(productId, { period, signal: controller.signal })
      .then((history) => {
        if (!cancelled) setState({ status: 'ready', history });
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
  }, [productId, period, attempt]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  return { state, retry };
}
