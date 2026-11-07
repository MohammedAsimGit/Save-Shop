import {
  priceHistoryResponseSchema,
  type HistoryPeriod,
  type PriceHistoryResponse,
} from '@smart-shopping/shared';

import { ApiError, apiRequest } from './apiClient';

/**
 * Price history client for the mobile app.
 *
 * Contract-validated before the screen sees it: an unparseable point is an error,
 * never a datapoint to plot. Nothing is cached client-side - a saved window would
 * be a stale chart.
 */
export async function fetchProductHistory(
  productId: string,
  period: HistoryPeriod,
): Promise<PriceHistoryResponse> {
  const payload = await apiRequest<unknown>(
    `/products/${encodeURIComponent(productId)}/history?period=${period}`,
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
