import type { ButtonHTMLAttributes, ReactNode } from 'react';

/**
 * Square icon-only control. `label` is required and becomes both the accessible
 * name and the tooltip, so an icon button can never ship unlabelled.
 */
export function IconButton({
  label,
  children,
  variant = 'ghost',
  className = '',
  type = 'button',
  ...rest
}: {
  readonly label: string;
  readonly children: ReactNode;
  readonly variant?: 'ghost' | 'surface' | 'brand';
  readonly className?: string;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'>) {
  const variants = {
    ghost: 'text-ink-muted hover:bg-surface-muted hover:text-ink',
    surface: 'bg-surface text-ink border border-line hover:border-line-strong shadow-soft',
    brand: 'bg-brand text-on-brand hover:bg-brand-dark',
  } as const;

  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={`grid size-10 shrink-0 place-items-center rounded-full transition-colors ${variants[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
