import { healthResponseSchema, type HealthResponse } from '@smart-shopping/shared';

import { apiRequest } from '../lib/apiClient';

/**
 * Reads API health. The payload is validated against the shared schema so a
 * contract drift fails loudly instead of rendering half-parsed data.
 */
export async function fetchApiHealth(): Promise<HealthResponse> {
  const data = await apiRequest<unknown>('/health');
  return healthResponseSchema.parse(data);
}
