import { type ReactNode } from 'react';

export function Table({
  columns,
  children,
}: {
  columns: string[];
  children: ReactNode;
}) {
  return (
    <div className="-mx-px w-full overflow-x-auto">
      <table className="w-full min-w-[36rem]">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-muted admin:text-faint">
            {columns.map((c) => (
              <th
                key={c}
                className="whitespace-nowrap px-3 py-2 font-medium sm:px-4 last:text-right admin:border-b admin:border-line-soft admin:py-2.5 admin:text-[11px] admin:font-semibold admin:tracking-[0.5px]"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Row({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <tr
      onClick={onClick}
      className={
        'border-t border-line text-sm admin:border-line-soft admin:text-[13.5px] admin:hover:bg-hover ' +
        (onClick ? 'cursor-pointer hover:bg-canvas/60' : '')
      }
    >
      {children}
    </tr>
  );
}
