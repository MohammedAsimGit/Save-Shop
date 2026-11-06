import type { ReactNode } from 'react';

export type BadgeTone = 'brand' | 'success' | 'discount' | 'neutral' | 'warning' | 'outline';

const tones: Record<BadgeTone, string> = {
  brand: 'bg-brand text-on-brand',
  success: 'bg-brand-soft text-brand-dark dark:text-brand',
  discount: 'bg-discount/10 text-discount',
  neutral: 'bg-surface-muted text-ink-muted',
  warning: 'bg-warning/10 text-warning',
  outline: 'border border-line text-ink-muted',
};

/** Small status/label pill. Never used for prices - that is <PriceLabel>. */
export function Badge({
  tone = 'neutral',
  children,
  icon,
  className = '',
}: {
  readonly tone?: BadgeTone;
  readonly children: ReactNode;
  readonly icon?: ReactNode;
  readonly className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide uppercase ${tones[tone]} ${className}`}
    >
      {icon}
      {children}
    </span>
  );
}
