import {
  catalogueProductResponseSchema,
  catalogueSearchResponseSchema,
  productListingsResponseSchema,
  type CatalogueProductResponse,
  type CatalogueSearchResponse,
  type ProductListingsResponse,
} from '@smart-shopping/shared';

import { ApiError, apiRequest } from '../lib/apiClient';

/**
 * Canonical catalogue API client.
 *
 * Responses are parsed against the shared contracts before a component sees them.
 * The catalogue is the authority for product identity, so an unvalidated payload is
 * treated as a bug rather than rendered hopefully.
 */

export interface CatalogueSearchParams {
  readonly q?: string;
  readonly brand?: string;
  readonly category?: string;
  readonly page?: number;
  readonly pageSize?: number;
}

export async function fetchCatalogueProducts(
  params: CatalogueSearchParams,
  options: { readonly signal?: AbortSignal } = {},
): Promise<CatalogueSearchResponse> {
  const search = new URLSearchParams();
  if (params.q) search.set('q', params.q);
  if (params.brand) search.set('brand', params.brand);
  if (params.category) search.set('category', params.category);
  if (params.page) search.set('page', String(params.page));
  if (params.pageSize) search.set('pageSize', String(params.pageSize));

  const suffix = search.size > 0 ? `?${search.toString()}` : '';
  const payload = await apiRequest<unknown>(
    `/products${suffix}`,
    options.signal ? { signal: options.signal } : {},
  );

  const parsed = catalogueSearchResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new ApiError({
      status: 200,
      code: 'INVALID_RESPONSE',
      message: 'The catalogue response did not match the agreed contract',
    });
  }

  return parsed.data;
}

export async function fetchProductIdentity(
  productId: string,
  options: { readonly signal?: AbortSignal } = {},
): Promise<CatalogueProductResponse> {
  const payload = await apiRequest<unknown>(
    `/products/${encodeURIComponent(productId)}`,
    options.signal ? { signal: options.signal } : {},
  );

  const parsed = catalogueProductResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new ApiError({
      status: 200,
      code: 'INVALID_RESPONSE',
      message: 'The product identity response did not match the agreed contract',
    });
  }

  return parsed.data;
}

export async function fetchProductListings(
  productId: string,
  options: { readonly signal?: AbortSignal } = {},
): Promise<ProductListingsResponse> {
  const payload = await apiRequest<unknown>(
    `/products/${encodeURIComponent(productId)}/listings`,
    options.signal ? { signal: options.signal } : {},
  );

  const parsed = productListingsResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new ApiError({
      status: 200,
      code: 'INVALID_RESPONSE',
      message: 'The listing response did not match the agreed contract',
    });
  }

  return parsed.data;
}
