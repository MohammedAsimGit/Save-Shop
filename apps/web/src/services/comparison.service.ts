import {
  productComparisonResponseSchema,
  sourceCoverageResponseSchema,
  type ProductComparisonResponse,
  type SourceCoverageResponse,
} from '@smart-shopping/shared';

import { ApiError, apiRequest } from '../lib/apiClient';

/**
 * Comparison API client.
 *
 * The payload is parsed against the shared contract before it reaches a
 * component. A response that does not match is a bug, not something to render
 * optimistically - an unvalidated price is how a comparison site starts lying.
 */

export async function fetchProductComparison(
  productId: string,
  options: { readonly signal?: AbortSignal } = {},
): Promise<ProductComparisonResponse> {
  const payload = await apiRequest<unknown>(
    `/products/${encodeURIComponent(productId)}/comparison`,
    options.signal ? { signal: options.signal } : {},
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

export async function fetchSourceCoverage(
  options: { readonly signal?: AbortSignal } = {},
): Promise<SourceCoverageResponse> {
  const payload = await apiRequest<unknown>(
    '/sources',
    options.signal ? { signal: options.signal } : {},
  );

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
