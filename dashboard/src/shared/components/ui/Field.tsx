import { type InputHTMLAttributes, type SelectHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

export function Field({
  label,
  children,
  required,
  hint,
  error,
  as = 'label',
}: {
  /** Use `div` when the control contains its own buttons or popover (a label would forward clicks to it). */
  as?: 'label' | 'div';
  label: string;
  children: ReactNode;
  required?: boolean;
  hint?: string;
  error?: string | null;
}) {
  const Wrapper = as;
  return (
    <Wrapper className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink flat:mb-1 flat:text-xs flat:text-muted">
        {label}
        {required ? <span className="ml-0.5 text-rose-600">*</span> : null}
      </span>
      {children}
      {error ? (
        <span className="mt-1 block text-xs text-rose-600 dark:text-rose-400 flat:text-[11.5px]">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-muted">{hint}</span>
      ) : null}
    </Wrapper>
  );
}

export const inputBase =
  'w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm text-ink outline-none transition placeholder:text-faint focus:border-brand-400 focus:ring-4 focus:ring-brand-100 flat:rounded-lg flat:bg-elevated flat:py-2 flat:text-[13.5px] flat:focus:border-brand-600 flat:focus:ring-[3px] flat:focus:ring-brand-600/15';

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(inputBase, className)} {...props} />;
}

export function Select({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(inputBase, className)} {...props}>
      {children}
    </select>
  );
}
