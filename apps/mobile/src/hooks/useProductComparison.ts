import { useCallback, useEffect, useState } from 'react';
import type { ProductComparisonResponse } from '@smart-shopping/shared';

import { ApiError } from '../services/apiClient';
import { fetchProductComparison } from '../services/comparison.service';

export type ProductComparisonState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly comparison: ProductComparisonResponse }
  | {
      readonly status: 'error';
      readonly message: string;
      readonly isNetworkError: boolean;
    };

/**
 * Loads one product's comparison from the API.
 *
 * No fallback to the local catalogue: sample prices must never stand in for a
 * comparison the engine did not produce.
 */
export function useProductComparison(productId: string | undefined): {
  state: ProductComparisonState;
  retry: () => void;
} {
  const [state, setState] = useState<ProductComparisonState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!productId) {
      setState({ status: 'error', message: 'No product was requested', isNetworkError: false });
      return;
    }

    let cancelled = false;
    setState({ status: 'loading' });

    fetchProductComparison(productId)
      .then((comparison) => {
        if (!cancelled) setState({ status: 'ready', comparison });
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
  }, [productId, attempt]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  return { state, retry };
}
