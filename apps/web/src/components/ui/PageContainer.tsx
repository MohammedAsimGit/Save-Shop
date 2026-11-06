import type { ReactNode } from 'react';

/**
 * Horizontal page rhythm.
 *
 * Every screen uses this so the content column, gutters and bottom spacing stay
 * identical whether the viewport is 360 px or 1920 px.
 */
export function PageContainer({
  children,
  className = '',
  size = 'default',
}: {
  readonly children: ReactNode;
  readonly className?: string;
  readonly size?: 'default' | 'narrow';
}) {
  return (
    <div
      className={`mx-auto w-full px-4 sm:px-6 lg:px-8 ${
        size === 'narrow' ? 'max-w-3xl' : 'max-w-[1180px]'
      } ${className}`}
    >
      {children}
    </div>
  );
}

/** Vertical stack with consistent gaps; used instead of ad-hoc margins. */
export function PageSection({
  children,
  title,
  action,
  className = '',
}: {
  readonly children: ReactNode;
  readonly title?: string;
  readonly action?: ReactNode;
  readonly className?: string;
}) {
  return (
    <section className={`space-y-4 ${className}`}>
      {(title || action) && (
        <div className="flex items-end justify-between gap-4">
          {title && <h2 className="text-lg font-semibold tracking-tight sm:text-xl">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
