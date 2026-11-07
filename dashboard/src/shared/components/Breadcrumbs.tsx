import { ChevronRight } from '@/shared/icons';
import { Link } from 'react-router-dom';

export type Crumb = { label: string; to?: string };

/** Quiet "Parent / Current" trail. The last item is the current page. */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1.5 text-sm">
        {items.map((c, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${c.label}-${i}`} className="flex min-w-0 items-center gap-1.5">
              {c.to && !last ? (
                <Link to={c.to} className="text-muted transition hover:text-ink">
                  {c.label}
                </Link>
              ) : (
                <span
                  className={last ? 'truncate font-medium text-ink' : 'text-muted'}
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
