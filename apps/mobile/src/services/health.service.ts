import { healthResponseSchema, type HealthResponse } from '@smart-shopping/shared';

import { apiRequest } from './apiClient';

/** Reads API health and validates it against the shared contract. */
export async function fetchApiHealth(): Promise<HealthResponse> {
  const data = await apiRequest<unknown>('/health');
  return healthResponseSchema.parse(data);
}
