import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { buttonStyles, type ButtonSize, type ButtonVariant } from './buttonStyles';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly block?: boolean;
  readonly leadingIcon?: ReactNode;
  readonly trailingIcon?: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  block = false,
  leadingIcon,
  trailingIcon,
  className = '',
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button type={type} className={buttonStyles({ variant, size, block, className })} {...rest}>
      {leadingIcon}
      {children}
      {trailingIcon}
    </button>
  );
}
