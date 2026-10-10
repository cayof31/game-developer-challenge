import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** which menu sprite backs the button (see the .btn--* classes) */
  variant?: ButtonVariant;
  children: ReactNode;
}

/**
 * The game's button: sprite-backed via the shared .btn classes. Defaults to
 * type="button" so it never submits a surrounding form by accident; every
 * native button attribute (disabled, onClick, aria-*) passes through.
 */
export function Button({ variant = 'primary', className, children, type, ...rest }: ButtonProps) {
  const classes = className ? `btn btn--${variant} ${className}` : `btn btn--${variant}`;
  return (
    <button type={type ?? 'button'} className={classes} {...rest}>
      {children}
    </button>
  );
}

export default Button;
