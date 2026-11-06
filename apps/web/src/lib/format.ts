import type { Money } from '@smart-shopping/shared';

/**
 * Display formatting helpers.
 *
 * Money arrives as integer minor units with an explicit currency; formatting is
 * the only place that divides by 100, so rounding bugs cannot spread.
 */

const formatters = new Map<string, Intl.NumberFormat>();

function formatterFor(currency: string): Intl.NumberFormat {
  const cached = formatters.get(currency);
  if (cached) return cached;

  const formatter = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  });
  formatters.set(currency, formatter);
  return formatter;
}

export function formatMoney(money: Money): string {
  return formatterFor(money.currency).format(money.amountMinor / 100);
}

export function formatRating(rating: number): string {
  return rating.toFixed(1);
}

export function formatCompactCount(count: number): string {
  if (count < 1000) return String(count);
  if (count < 100_000) return `${(count / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return `${Math.round(count / 1000)}k`;
}

/** "just now", "12 min ago", "3 h ago", "2 d ago" - deliberately coarse. */
export function formatRelativeTime(iso: string): string {
  const timestamp = new Date(iso).getTime();
  if (Number.isNaN(timestamp)) return 'unknown';

  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;

  return `${Math.round(hours / 24)} d ago`;
}
