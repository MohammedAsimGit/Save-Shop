import {
  catalogueProductResponseSchema,
  catalogueSearchResponseSchema,
  productListingsResponseSchema,
  type CatalogueProductResponse,
  type CatalogueSearchResponse,
  type ProductListingsResponse,
} from '@smart-shopping/shared';

import { ApiError, apiRequest } from './apiClient';

/**
 * Canonical catalogue API client for the mobile app.
 *
 * Every payload is validated against the shared contract before a screen sees it:
 * product identity decides what a shopper compares, so an unparseable response is
 * an error rather than something to render hopefully.
 */

export interface MobileCatalogueSearchParams {
  readonly q?: string;
  readonly category?: string;
  readonly page?: number;
  readonly pageSize?: number;
}

export async function fetchCatalogueProducts(
  params: MobileCatalogueSearchParams,
): Promise<CatalogueSearchResponse> {
  const search = new URLSearchParams();
  if (params.q) search.set('q', params.q);
  if (params.category) search.set('category', params.category);
  if (params.page) search.set('page', String(params.page));
  if (params.pageSize) search.set('pageSize', String(params.pageSize));

  const suffix = search.size > 0 ? `?${search.toString()}` : '';
  const payload = await apiRequest<unknown>(`/products${suffix}`);

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

export async function fetchProductIdentity(productId: string): Promise<CatalogueProductResponse> {
  const payload = await apiRequest<unknown>(`/products/${encodeURIComponent(productId)}`);

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

export async function fetchProductListings(productId: string): Promise<ProductListingsResponse> {
  const payload = await apiRequest<unknown>(`/products/${encodeURIComponent(productId)}/listings`);

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
