import { Children, type ReactNode, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from '@/shared/icons';

export const PAGE_SIZE = 10;

/** Page state for a list: slice it with `slice`, render `<Pagination {...pager} />`. */
export function usePagination(total: number, pageSize = PAGE_SIZE) {
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  // A new result set (filter, search, refetch with different size) starts at page 1.
  useEffect(() => setPage(1), [total]);
  const current = Math.min(page, pages);
  return {
    page: current,
    pages,
    total,
    pageSize,
    setPage,
    slice: <T,>(items: T[]) => items.slice((current - 1) * pageSize, current * pageSize),
  };
}

function pageList(page: number, pages: number): (number | '…')[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const out: (number | '…')[] = [1];
  const from = Math.max(2, page - 1);
  const to = Math.min(pages - 1, page + 1);
  if (from > 2) out.push('…');
  for (let i = from; i <= to; i++) out.push(i);
  if (to < pages - 1) out.push('…');
  out.push(pages);
  return out;
}

/** Footer for paged lists. Renders nothing when everything fits on one page. */
export function Pagination({
  page,
  pages,
  total,
  pageSize,
  setPage,
}: Pick<ReturnType<typeof usePagination>, 'page' | 'pages' | 'total' | 'pageSize' | 'setPage'>) {
  if (total <= pageSize) return null;
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);
  const btn =
    'inline-flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-[13px] tabular-nums transition-colors';
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 flat:border-line-soft">
      <p className="text-xs text-muted">
        Showing <span className="font-medium text-ink">{first}–{last}</span> of{' '}
        <span className="font-medium text-ink">{total}</span>
      </p>
      <nav className="flex items-center gap-1" aria-label="Pagination">
        <button
          type="button"
          aria-label="Previous page"
          disabled={page === 1}
          onClick={() => setPage(page - 1)}
          className={`${btn} text-muted hover:bg-hover disabled:opacity-40 disabled:hover:bg-transparent`}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        {pageList(page, pages).map((p, i) =>
          p === '…' ? (
            <span key={`gap${i}`} className="px-1 text-xs text-faint">
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              aria-current={p === page ? 'page' : undefined}
              onClick={() => setPage(p)}
              className={
                btn +
                (p === page
                  ? ' bg-brand-600 font-semibold text-white'
                  : ' text-muted hover:bg-hover')
              }
            >
              {p}
            </button>
          ),
        )}
        <button
          type="button"
          aria-label="Next page"
          disabled={page === pages}
          onClick={() => setPage(page + 1)}
          className={`${btn} text-muted hover:bg-hover disabled:opacity-40 disabled:hover:bg-transparent`}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </nav>
    </div>
  );
}

/**
 * Shared table. Rows passed as children are paged {@link PAGE_SIZE} at a time, so any
 * list that can grow is paginated by default. Pass `paginate={false}` for a fixed,
 * short table.
 */
export function Table({
  columns,
  children,
  paginate = true,
}: {
  columns: string[];
  children: ReactNode;
  paginate?: boolean;
}) {
  const rows = Children.toArray(children);
  const pager = usePagination(rows.length);
  const visible = paginate ? pager.slice(rows) : rows;
  return (
    <>
      <div className="-mx-px w-full overflow-x-auto">
        <table className="w-full min-w-[36rem]">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-muted flat:text-faint">
              {columns.map((c) => (
                <th
                  key={c}
                  className="whitespace-nowrap px-3 py-2 font-medium sm:px-4 last:text-right flat:border-b flat:border-line-soft flat:py-2.5 flat:text-[11px] flat:font-semibold flat:tracking-[0.5px]"
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{visible}</tbody>
        </table>
      </div>
      {paginate ? <Pagination {...pager} /> : null}
    </>
  );
}

export function Row({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <tr
      onClick={onClick}
      className={
        'border-t border-line text-sm flat:border-line-soft flat:text-[13.5px] flat:hover:bg-hover ' +
        (onClick ? 'cursor-pointer hover:bg-canvas/60' : '')
      }
    >
      {children}
    </tr>
  );
}
