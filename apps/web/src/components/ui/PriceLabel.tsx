import type { Money } from '@smart-shopping/shared';

import { formatMoney } from '../../lib/format';

const sizes = {
  sm: 'text-sm',
  md: 'text-lg',
  lg: 'text-2xl',
  xl: 'text-3xl',
  hero: 'text-4xl sm:text-5xl',
} as const;

/**
 * Money on screen.
 *
 * Prices are the most important number in the product, so they get tabular
 * figures (no width jitter between values) and a dedicated component instead of
 * ad-hoc spans. `compareAt` renders the struck-through list price beside it.
 */
export function PriceLabel({
  price,
  compareAt,
  size = 'md',
  emphasis = false,
  prefix,
  className = '',
}: {
  readonly price: Money;
  readonly compareAt?: Money;
  readonly size?: keyof typeof sizes;
  readonly emphasis?: boolean;
  readonly prefix?: string;
  readonly className?: string;
}) {
  return (
    <span className={`inline-flex flex-wrap items-baseline gap-x-2 gap-y-0.5 ${className}`}>
      {prefix && <span className="text-xs font-medium text-ink-muted">{prefix}</span>}
      <span
        className={`tabular font-bold tracking-tight ${sizes[size]} ${
          emphasis ? 'text-brand-dark dark:text-brand' : 'text-ink'
        }`}
      >
        {formatMoney(price)}
      </span>
      {compareAt && compareAt.amountMinor > price.amountMinor && (
        <span className="tabular text-xs text-ink-subtle line-through">
          {formatMoney(compareAt)}
        </span>
      )}
    </span>
  );
}
