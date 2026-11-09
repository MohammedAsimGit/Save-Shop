import { AlertTriangle, ArrowUpRight, GraduationCap } from 'lucide-react';

import type { ReviewQueueItem } from '@smart-shopping/shared';

import { Badge } from '../ui/Badge';
import { SkeletonBlock } from '../ui/LoadingSkeleton';
import { formatTimestamp, strengthLabel, verdictTone } from './adminPresentation';

/**
 * Queue list.
 *
 * One row per listing that needs a human. The row shows the original marketplace
 * title, the verdict, the deterministic strength score and why the listing is
 * here - enough to triage without opening the detail panel.
 */
export function ReviewQueueList({
  items,
  selectedId,
  onSelect,
  loading,
  error,
  onRetry,
}: {
  readonly items: readonly ReviewQueueItem[];
  readonly selectedId: string | null;
  readonly onSelect: (listingId: string) => void;
  readonly loading: boolean;
  readonly error: string | null;
  readonly onRetry: () => void;
}) {
  if (loading) {
    return (
      <div aria-busy="true" className="space-y-3">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="space-y-2 rounded-tile border border-line bg-surface p-4">
            <SkeletonBlock className="h-4 w-3/4" />
            <SkeletonBlock className="h-3 w-1/2" />
            <SkeletonBlock className="h-3 w-2/3" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-3 rounded-tile border border-danger/30 bg-danger/5 p-4">
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="text-sm font-semibold text-brand-dark underline dark:text-brand"
        >
          Try again
        </button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-tile border border-dashed border-line-strong/70 bg-surface-muted/60 p-6 text-center">
        <p className="text-sm font-semibold text-ink">Nothing waiting for review</p>
        <p className="mt-1 text-sm text-ink-muted">
          Listings whose automatic match is exact or strong are resolved without a human. Change the
          filters or scope to see decisions that were already made.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {items.map((item) => {
        const selected = item.listing.id === selectedId;

        return (
          <li key={item.listing.id}>
            <button
              type="button"
              onClick={() => onSelect(item.listing.id)}
              aria-current={selected ? 'true' : undefined}
              className={`w-full space-y-2 rounded-tile border p-4 text-left transition-colors ${
                selected
                  ? 'border-brand bg-brand-soft/60 shadow-soft dark:bg-brand/10'
                  : 'border-line bg-surface hover:border-line-strong hover:bg-surface-muted/60'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="line-clamp-2 text-sm font-semibold text-ink">{item.listing.title}</p>
                <Badge tone={verdictTone(item.listing.match.status)}>
                  {item.listing.match.status}
                </Badge>
              </div>

              <p className="text-xs text-ink-muted">
                {item.listing.sourceId} · {item.listing.marketplaceId} ·{' '}
                <span className="font-mono">{item.listing.externalId}</span>
              </p>

              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="outline">{strengthLabel(item.listing.match.confidence)}</Badge>
                <Badge tone="outline">{item.listing.match.method}</Badge>
                {item.listing.isSample && (
                  <Badge
                    tone="warning"
                    icon={<GraduationCap aria-hidden="true" className="size-3" />}
                  >
                    Sample
                  </Badge>
                )}
                {item.conflicts.length > 0 && (
                  <Badge
                    tone="discount"
                    icon={<AlertTriangle aria-hidden="true" className="size-3" />}
                  >
                    {item.conflicts.length} conflict{item.conflicts.length === 1 ? '' : 's'}
                  </Badge>
                )}
              </div>

              <p className="line-clamp-2 text-xs text-ink-muted">{item.reviewRequiredReason}</p>

              <p className="flex items-center gap-1 text-[11px] text-ink-subtle">
                Observed {formatTimestamp(item.listing.lastObservedAt)}
                <ArrowUpRight aria-hidden="true" className="size-3" />
              </p>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
