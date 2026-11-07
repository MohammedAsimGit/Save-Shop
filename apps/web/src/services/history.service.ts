import {
  priceHistoryResponseSchema,
  type HistoryPeriod,
  type PriceHistoryResponse,
} from '@smart-shopping/shared';

import { ApiError, apiRequest } from '../lib/apiClient';

/**
 * Price history client.
 *
 * The payload is validated against the shared contract before a chart sees it.
 * A malformed point is an error, not something to plot: a trend line built from
 * unvalidated numbers is worse than no chart.
 */

export interface HistoryRequestOptions {
  readonly period: HistoryPeriod;
  readonly signal?: AbortSignal;
}

export async function fetchProductHistory(
  productId: string,
  options: HistoryRequestOptions,
): Promise<PriceHistoryResponse> {
  const query = new URLSearchParams({ period: options.period });
  const payload = await apiRequest<unknown>(
    `/products/${encodeURIComponent(productId)}/history?${query.toString()}`,
    options.signal ? { signal: options.signal } : {},
  );

  const parsed = priceHistoryResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new ApiError({
      status: 200,
      code: 'INVALID_RESPONSE',
      message: 'The price history response did not match the agreed contract',
    });
  }

  return parsed.data;
}
