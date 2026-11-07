import { cn } from '../lib/cn';

export type TabItem<T extends string = string> = { id: T; label: string; count?: number };

/** Plain text tabs with an underline — the section switcher for detail pages. */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  label: string;
}) {
  return (
    <nav
      className="-mx-1 flex gap-6 overflow-x-auto overflow-y-hidden border-b border-line px-1"
      aria-label={label}
    >
      {tabs.map(({ id, label: text, count }) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          aria-current={value === id ? 'page' : undefined}
          className={cn(
            'shrink-0 border-b-2 pb-3 pt-1 text-sm font-medium transition',
            value === id ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-ink',
          )}
        >
          {text}
          {count ? <span className="ml-1.5 text-xs font-normal text-faint">{count}</span> : null}
        </button>
      ))}
    </nav>
  );
}
