import { useCallback, useEffect, useState } from 'react';

import type { HistoryPeriod, PriceHistoryResponse } from '@smart-shopping/shared';

import { ApiError } from '../services/apiClient';
import { fetchProductHistory } from '../services/history.service';

export type ProductHistoryState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly history: PriceHistoryResponse }
  | { readonly status: 'error'; readonly message: string; readonly isNetworkError: boolean };

/**
 * Loads stored history for one product and period.
 *
 * Refetches when the period changes and ignores responses from a request that was
 * superseded, so a slow 90-day answer cannot overwrite a newer 7-day one.
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

    let cancelled = false;
    setState({ status: 'loading' });

    fetchProductHistory(productId, period)
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
    };
  }, [productId, period, attempt]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  return { state, retry };
}
