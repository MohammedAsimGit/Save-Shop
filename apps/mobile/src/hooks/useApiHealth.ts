import { useCallback, useEffect, useState } from 'react';
import type { HealthResponse } from '@smart-shopping/shared';

import { ApiError } from '../services/apiClient';
import { fetchApiHealth } from '../services/health.service';

export type ApiHealthState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly health: HealthResponse }
  | { readonly status: 'error'; readonly message: string; readonly isNetworkError: boolean };

export function useApiHealth(): { state: ApiHealthState; retry: () => void } {
  const [state, setState] = useState<ApiHealthState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });

    fetchApiHealth()
      .then((health) => {
        if (!cancelled) setState({ status: 'ready', health });
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
  }, [attempt]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  return { state, retry };
}
