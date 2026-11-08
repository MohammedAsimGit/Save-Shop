import { useCallback, useEffect, useState } from 'react';

import type { CatalogueProductResponse, ProductListingsResponse } from '@smart-shopping/shared';

import { ApiError } from '../lib/apiClient';
import { fetchProductIdentity, fetchProductListings } from '../services/catalogue.service';

export type ProductIdentityState =
  | { readonly status: 'loading' }
  | {
      readonly status: 'ready';
      readonly identity: CatalogueProductResponse;
      readonly listings: ProductListingsResponse | null;
    }
  | {
      readonly status: 'error';
      readonly message: string;
      readonly isNetworkError: boolean;
    };

/**
 * Loads canonical identity and marketplace listings for one product.
 *
 * Listings are secondary: if only they fail, the identity block still renders and
 * says that listing status is unavailable, because identity and listing evidence are
 * different questions.
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

    const controller = new AbortController();
    let cancelled = false;
    setState({ status: 'loading' });

    fetchProductIdentity(productId, { signal: controller.signal })
      .then(async (identity) => {
        const listings = await fetchProductListings(productId, {
          signal: controller.signal,
        }).catch(() => null);

        if (!cancelled) setState({ status: 'ready', identity, listings });
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
  }, [productId, attempt]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  return { state, retry };
}
