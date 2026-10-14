import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

/** Titled group of related fields: the standard building block of every form. */
export function FormSection({
  title,
  description,
  icon: Icon,
  children,
  className,
}: {
  title: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('rounded-2xl border border-line bg-surface p-4 sm:p-5', className)}>
      <header className="mb-4 flex items-start gap-3">
        {Icon ? (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
            <Icon className="h-4 w-4" />
          </span>
        ) : null}
        <div>
          <h3 className="text-sm font-semibold text-ink">{title}</h3>
          {description ? <p className="mt-0.5 text-xs text-muted">{description}</p> : null}
        </div>
      </header>
      {children}
    </section>
  );
}

/** Two-column responsive grid for form fields (one column on phones). */
export function FieldGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid gap-x-4 gap-y-4 sm:grid-cols-2', className)}>{children}</div>;
}
