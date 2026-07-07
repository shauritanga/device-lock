import { type ReactNode } from 'react';

export function Table({
  columns,
  children,
}: {
  columns: string[];
  children: ReactNode;
}) {
  return (
    <table className="w-full">
      <thead>
        <tr className="text-left text-xs uppercase tracking-wide text-muted">
          {columns.map((c) => (
            <th key={c} className="px-4 py-2 font-medium last:text-right">
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}

export function Row({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <tr
      onClick={onClick}
      className={
        'border-t border-line text-sm ' +
        (onClick ? 'cursor-pointer hover:bg-canvas/60' : '')
      }
    >
      {children}
    </tr>
  );
}
