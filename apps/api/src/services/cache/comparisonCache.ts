/**
 * Comparison response cache.
 *
 * The interface is deliberately tiny: get / set / delete / clear. Persistence
 * choice (MongoDB or memory) is an implementation detail, and the comparison
 * service never learns which one it received.
 *
 * Correctness rules live with the caller:
 * - a cached payload is re-validated against the response contract on every hit;
 * - a hit is only honoured while the entry and every offer inside it are still
 *   inside their freshness window;
 * - failures are never cached.
 */

export interface ComparisonCacheEntry {
  readonly key: string;
  /** The exact response payload that was returned to clients. */
  readonly payload: unknown;
  readonly createdAt: Date;
  readonly expiresAt: Date;
}

export interface ComparisonCache {
  readonly kind: 'memory' | 'mongodb';
  get(key: string): Promise<ComparisonCacheEntry | null>;
  set(entry: ComparisonCacheEntry): Promise<void>;
  delete(key: string): Promise<void>;
  /** Removes every entry; returns how many were removed. */
  clear(): Promise<number>;
}

/**
 * Cache key.
 *
 * Includes the product, the ranking currency and the enabled source set: enabling
 * a provider must not serve a payload built without it. Bumping `CACHE_VERSION`
 * after a response-shape change invalidates old entries without a migration.
 */
export const COMPARISON_CACHE_VERSION = 'v1';

export function comparisonCacheKey(options: {
  readonly productId: string;
  readonly currency: string;
  readonly enabledSourceIds: readonly string[];
}): string {
  const sources = [...options.enabledSourceIds].sort().join(',');
  return `comparison:${COMPARISON_CACHE_VERSION}:${options.productId}:${options.currency}:${sources}`;
}
