import type { MatchStatus, ReviewDecisionType } from '@smart-shopping/shared';

import type { BadgeTone } from '../ui/Badge';

/**
 * Presentation-only mappings for the admin surface.
 *
 * Matching strength is a deterministic score, so it is always rendered as
 * `72/100 strength` and never as a percentage of confidence or "72% likely".
 */

export function verdictTone(status: MatchStatus): BadgeTone {
  switch (status) {
    case 'exact':
    case 'strong':
      return 'success';
    case 'possible':
      return 'warning';
    case 'conflict':
      return 'discount';
    default:
      return 'neutral';
  }
}

export function decisionTone(decision: ReviewDecisionType): BadgeTone {
  switch (decision) {
    case 'accepted':
    case 'reassigned':
      return 'success';
    case 'rejected':
      return 'discount';
    case 'deferred':
      return 'warning';
    default:
      return 'neutral';
  }
}

export function strengthLabel(confidence: number): string {
  return `${confidence}/100 strength`;
}

export function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function shortId(value: string, length = 10): string {
  return value.length <= length ? value : `${value.slice(0, length)}…`;
}
