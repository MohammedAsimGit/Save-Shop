import { SearchX } from 'lucide-react';
import type { ReactNode } from 'react';

/** Shown when a query or filter combination legitimately matches nothing. */
export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  readonly title: string;
  readonly description: string;
  readonly action?: ReactNode;
  readonly icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-card border border-dashed border-line bg-surface/60 px-6 py-14 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-surface-muted text-ink-subtle">
        {icon ?? <SearchX aria-hidden="true" className="size-5" />}
      </span>
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      <p className="max-w-sm text-sm text-ink-muted">{description}</p>
      {action}
    </div>
  );
}
