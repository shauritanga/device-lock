import { type ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const variants: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 shadow-sm flat:shadow-none flat:hover:bg-brand-600 flat:hover:opacity-90 flat:hover:shadow-[0_0_0_3px_rgb(var(--brand-600)/0.25)]',
  secondary: 'bg-surface text-ink border border-line hover:bg-canvas flat:bg-elevated flat:text-ink-soft flat:hover:bg-hover flat:hover:text-ink',
  ghost: 'text-muted hover:bg-canvas hover:text-ink',
  danger: 'bg-rose-600 text-white hover:bg-rose-700',
};

export function Button({
  variant = 'primary',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50',
        'flat:gap-1.5 flat:rounded-lg flat:px-3.5 flat:py-[7px] flat:text-[13px]',
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
