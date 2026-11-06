import type { ReactNode } from 'react';

/**
 * Section heading used across every screen: optional eyebrow, title, supporting
 * line and a trailing action (usually a "See all" link).
 */
export function SectionHeader({
  title,
  eyebrow,
  description,
  action,
  id,
  className = '',
}: {
  readonly title: string;
  readonly eyebrow?: string;
  readonly description?: string;
  readonly action?: ReactNode;
  readonly id?: string;
  readonly className?: string;
}) {
  return (
    <div className={`flex items-end justify-between gap-4 ${className}`}>
      <div className="min-w-0 space-y-1">
        {eyebrow && (
          <p className="text-[11px] font-semibold tracking-[0.14em] text-brand-dark uppercase dark:text-brand">
            {eyebrow}
          </p>
        )}
        <h2 id={id} className="text-lg font-semibold tracking-tight sm:text-xl">
          {title}
        </h2>
        {description && <p className="max-w-prose text-sm text-ink-muted">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
