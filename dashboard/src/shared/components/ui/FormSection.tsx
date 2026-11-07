import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

/**
 * A titled group of related fields, rucky-rentals style: a small uppercase
 * label (with an optional one-line hint) and the fields beneath it, with no
 * box around them. Stack several with `space-y-6`.
 */
export function FormSection({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  /** Accepted for older call sites; sections are intentionally icon-free. */
  icon?: unknown;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('space-y-3.5', className)}>
      <header>
        <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.6px] text-faint">{title}</h3>
        {description ? <p className="mt-1 text-xs text-muted">{description}</p> : null}
      </header>
      {children}
    </section>
  );
}

/** Two-column responsive grid for form fields (one column on phones). */
export function FieldGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid gap-x-3 gap-y-3.5 sm:grid-cols-2', className)}>{children}</div>;
}
