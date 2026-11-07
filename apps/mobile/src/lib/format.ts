import type { Money } from '@smart-shopping/shared';

/**
 * Money formatting for React Native.
 *
 * Hermes ships Intl on current React Native versions, but a device without it
 * must not crash a product list, so there is a deterministic fallback.
 */

export function formatMoney(money: Money): string {
  const value = money.amountMinor / 100;

  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: money.currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${money.currency} ${Math.round(value).toLocaleString('en-US')}`;
  }
}

export function formatCompactCount(count: number): string {
  if (count < 1000) return String(count);
  if (count < 100_000) return `${(count / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return `${Math.round(count / 1000)}k`;
}

/** "7 Nov" - short axis label; the year is implied by the period window. */
export function formatShortDate(iso: string): string {
  const timestamp = Date.parse(iso);
  if (Number.isNaN(timestamp)) return '—';

  try {
    return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(timestamp);
  } catch {
    return new Date(timestamp).toDateString().slice(4, 10);
  }
}

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
