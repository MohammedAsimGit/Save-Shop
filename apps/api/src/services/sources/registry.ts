import type { MarketSource, SourceCoverageResponse } from '@smart-shopping/shared';

import { createDemoSourceAdapter } from './demoSource.js';
import { createPendingSourceAdapters } from './pendingSources.js';
import type { MarketSourceAdapter } from './sourceAdapter.js';

/**
 * Source registry.
 *
 * Owns the set of known providers and answers the question the UI must never
 * answer by guessing: which marketplaces are actually available, and why not.
 */

export interface SourceRegistry {
  readonly adapters: readonly MarketSourceAdapter[];
  readonly sources: readonly MarketSource[];
  readonly enabledAdapters: readonly MarketSourceAdapter[];
  coverage(now?: Date): SourceCoverageResponse;
}

export interface SourceRegistryOptions {
  /** Overrides the default adapter set; used by tests and future integrations. */
  readonly adapters?: readonly MarketSourceAdapter[];
  readonly now?: () => Date;
}

export function createSourceRegistry(options: SourceRegistryOptions = {}): SourceRegistry {
  const adapters =
    options.adapters ??
    ([createDemoSourceAdapter({ now: options.now }), ...createPendingSourceAdapters()] as const);

  const enabledAdapters = adapters.filter((adapter) => adapter.isEnabled);
  const sources = adapters.map((adapter) => adapter.source);

  return {
    adapters,
    sources,
    enabledAdapters,
    coverage(now = options.now?.() ?? new Date()): SourceCoverageResponse {
      const notices: string[] = [];

      const enabled = sources.filter((source) => source.enabled);
      const disabled = sources.filter((source) => !source.enabled);

      if (enabled.length === 0) {
        notices.push('No price source is enabled: the comparison cannot return any offer.');
      } else {
        notices.push(`Enabled sources: ${enabled.map((source) => source.displayName).join(', ')}.`);
      }

      if (enabled.some((source) => source.verification === 'sample')) {
        notices.push(
          'Enabled sample sources return invented prices and are labelled as demo data.',
        );
      }

      if (disabled.length > 0) {
        notices.push(
          `Awaiting written permission: ${disabled.map((source) => source.displayName).join(', ')}.`,
        );
      }

      return {
        generatedAt: now.toISOString(),
        sources,
        notices,
      };
    },
  };
}
