import { type InputHTMLAttributes, type SelectHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

export function Field({
  label,
  children,
  required,
  hint,
  error,
}: {
  label: string;
  children: ReactNode;
  required?: boolean;
  hint?: string;
  error?: string | null;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink">
        {label}
        {required ? <span className="ml-0.5 text-rose-600">*</span> : null}
      </span>
      {children}
      {error ? (
        <span className="mt-1 block text-xs text-rose-600">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-muted">{hint}</span>
      ) : null}
    </label>
  );
}

const base =
  'w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm text-ink outline-none transition placeholder:text-faint focus:border-brand-400 focus:ring-4 focus:ring-brand-100';

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(base, className)} {...props} />;
}

export function Select({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(base, className)} {...props}>
      {children}
    </select>
  );
}
