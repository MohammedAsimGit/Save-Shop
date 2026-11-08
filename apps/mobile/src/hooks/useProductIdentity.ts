import { useCallback, useEffect, useState } from 'react';

import type { CatalogueProductResponse } from '@smart-shopping/shared';

import { ApiError } from '../services/apiClient';
import { fetchProductIdentity } from '../services/catalogue.service';

export type ProductIdentityState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly identity: CatalogueProductResponse }
  | { readonly status: 'error'; readonly message: string; readonly isNetworkError: boolean };

/**
 * Loads the canonical identity of one product.
 *
 * Identity is secondary to the price comparison on this screen: if it cannot be
 * loaded, the screen says so and the comparison stays visible.
 */
export function useProductIdentity(productId: string | undefined): {
  state: ProductIdentityState;
  retry: () => void;
} {
  const [state, setState] = useState<ProductIdentityState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!productId) {
      setState({ status: 'error', message: 'No product was requested', isNetworkError: false });
      return;
    }

    let cancelled = false;
    setState({ status: 'loading' });

    fetchProductIdentity(productId)
      .then((identity) => {
        if (!cancelled) setState({ status: 'ready', identity });
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
