import { ChevronRight } from '@/shared/icons';
import { Link } from 'react-router-dom';
import { cn } from '../lib/cn';

export type Crumb = { label: string; to?: string };

/**
 * "Parent / Current" trail. The last item is the current page. The `topbar`
 * variant is the larger form used in the page header, where it replaces the title.
 */
export function Breadcrumbs({
  items,
  variant = 'inline',
}: {
  items: Crumb[];
  variant?: 'inline' | 'topbar';
}) {
  const top = variant === 'topbar';
  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className={cn('flex min-w-0 items-center gap-1.5', top ? 'text-base' : 'flex-wrap text-sm')}>
        {items.map((c, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${c.label}-${i}`} className={cn('flex items-center gap-1.5', last && 'min-w-0')}>
              {c.to && !last ? (
                <Link to={c.to} className="shrink-0 text-muted transition hover:text-ink">
                  {c.label}
                </Link>
              ) : (
                <span
                  className={cn(
                    last ? 'truncate font-semibold text-ink' : 'shrink-0 text-muted',
                    !top && last && 'font-medium',
                  )}
                  aria-current={last ? 'page' : undefined}
                >
                  {c.label}
                </span>
              )}
              {!last ? <ChevronRight className="h-3.5 w-3.5 shrink-0 text-faint" aria-hidden /> : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
