import {
  productComparisonResponseSchema,
  sourceCoverageResponseSchema,
  type ProductComparisonResponse,
  type SourceCoverageResponse,
} from '@smart-shopping/shared';

import { ApiError, apiRequest } from './apiClient';

/**
 * Comparison API client for the mobile app.
 *
 * The payload is validated against the shared contract before any screen sees it;
 * a malformed price response is an error, never something to render hopefully.
 */

export async function fetchProductComparison(
  productId: string,
): Promise<ProductComparisonResponse> {
  const payload = await apiRequest<unknown>(
    `/products/${encodeURIComponent(productId)}/comparison`,
  );

  const parsed = productComparisonResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new ApiError({
      status: 200,
      code: 'INVALID_RESPONSE',
      message: 'The comparison response did not match the agreed contract',
    });
  }

  return parsed.data;
}

export async function fetchSourceCoverage(): Promise<SourceCoverageResponse> {
  const payload = await apiRequest<unknown>('/sources');

  const parsed = sourceCoverageResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new ApiError({
      status: 200,
      code: 'INVALID_RESPONSE',
      message: 'The source coverage response did not match the agreed contract',
    });
  }

  return parsed.data;
}
