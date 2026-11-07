import { useCallback, useEffect, useState } from 'react';
import type { ProductComparisonResponse } from '@smart-shopping/shared';

import { ApiError } from '../lib/apiClient';
import { fetchProductComparison } from '../services/comparison.service';

export type ProductComparisonState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly comparison: ProductComparisonResponse }
  | {
      readonly status: 'error';
      readonly message: string;
      readonly isNetworkError: boolean;
      readonly code?: string;
    };

/**
 * Loads one product's comparison.
 *
 * No cache and no optimistic data: if the API cannot answer, the screen says so
 * rather than falling back to the local sample catalogue, because a comparison is
 * only meaningful when it comes from the comparison engine.
 */
export function useProductComparison(productId: string | undefined): {
  state: ProductComparisonState;
  retry: () => void;
} {
  const [state, setState] = useState<ProductComparisonState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!productId) {
      setState({
        status: 'error',
        message: 'No product was requested',
        isNetworkError: false,
        code: 'VALIDATION_ERROR',
      });
      return;
    }

    const controller = new AbortController();
    let cancelled = false;
    setState({ status: 'loading' });

    fetchProductComparison(productId, { signal: controller.signal })
      .then((comparison) => {
        if (!cancelled) setState({ status: 'ready', comparison });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState({
          status: 'error',
          message: error instanceof Error ? error.message : 'Unknown error',
          isNetworkError: error instanceof ApiError && error.isNetworkError,
          ...(error instanceof ApiError ? { code: error.code } : {}),
        });
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [productId, attempt]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  return { state, retry };
}
