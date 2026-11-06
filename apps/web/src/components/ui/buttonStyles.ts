export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'soft';
export type ButtonSize = 'sm' | 'md' | 'lg';

const base =
  'inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-colors ' +
  'disabled:cursor-not-allowed disabled:opacity-55 focus-visible:outline-2 focus-visible:outline-offset-2';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-on-brand hover:bg-brand-dark shadow-soft',
  secondary:
    'bg-surface text-ink border border-line hover:border-line-strong hover:bg-surface-muted',
  ghost: 'text-ink-muted hover:text-ink hover:bg-surface-muted',
  soft: 'bg-brand-soft text-brand-dark hover:bg-brand/15 dark:text-brand',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-9 px-3.5 text-sm',
  md: 'h-11 px-5 text-sm',
  lg: 'h-12 px-6 text-[15px]',
};

/**
 * Class builder shared by <Button> and by links that must look like buttons.
 * Lives outside Button.tsx so that file exports a component only (fast refresh).
 */
export function buttonStyles({
  variant = 'primary',
  size = 'md',
  block = false,
  className = '',
}: {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly block?: boolean;
  readonly className?: string;
} = {}): string {
  return `${base} ${variants[variant]} ${sizes[size]} ${block ? 'w-full' : ''} ${className}`;
}
