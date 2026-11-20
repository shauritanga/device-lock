import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from '@/shared/icons';
import { cn } from '../../lib/cn';
import { inputBase } from './Field';

export type ComboOption = {
  value: string;
  label: string;
  /** Second line, e.g. a phone number or model. */
  sub?: string;
  /** Extra text matched by the search box but not shown. */
  keywords?: string;
};

/**
 * Searchable dropdown. Closed, it looks like any other field; open, it shows a
 * small search box and a short list sized to the field, not the whole form.
 * Arrow keys move, Enter picks, Esc closes.
 */
export function Combobox({
  options,
  value,
  onChange,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  emptyText = 'Nothing found',
  invalid,
  disabled,
  loading,
}: {
  options: ComboOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  invalid?: boolean;
  disabled?: boolean;
  loading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);

  const selected = options.find((o) => o.value === value);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) =>
      [o.label, o.sub, o.keywords].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(Math.max(options.findIndex((o) => o.value === value), 0));
      requestAnimationFrame(() => search.current?.focus());
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    list.current?.children[active]?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  function pick(o: ComboOption) {
    onChange(o.value);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, shown.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (shown[active]) pick(shown[active]);
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      setOpen(false);
    }
  }

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          inputBase,
          'flex items-center justify-between gap-2 text-left',
          invalid && 'border-rose-400 focus:border-rose-400',
          disabled && 'cursor-not-allowed opacity-60',
        )}
      >
        <span className={cn('min-w-0 flex-1 truncate', !selected && 'text-faint')}>
          {selected ? selected.label : placeholder}
          {selected?.sub ? <span className="ml-2 text-muted">{selected.sub}</span> : null}
        </span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-faint transition', open && 'rotate-180')} />
      </button>

      {open ? (
        <div className="absolute left-0 z-30 mt-1 w-full min-w-[15rem] overflow-hidden rounded-xl border border-line bg-surface shadow-lg">
          <div className="relative border-b border-line-soft">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
            <input
              ref={search}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={searchPlaceholder}
              className="w-full bg-transparent py-2.5 pl-9 pr-3 text-sm text-ink outline-none placeholder:text-faint"
              autoComplete="off"
            />
          </div>
          <ul ref={list} role="listbox" className="max-h-56 overflow-y-auto py-1">
            {loading ? (
              <li className="px-3.5 py-3 text-sm text-muted">Loading…</li>
            ) : shown.length === 0 ? (
              <li className="px-3.5 py-3 text-sm text-muted">{emptyText}</li>
            ) : (
              shown.map((o, i) => (
                <li key={o.value} role="option" aria-selected={o.value === value}>
                  <button
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => pick(o)}
                    className={cn(
                      'flex w-full items-center gap-2 px-3.5 py-2 text-left text-sm',
                      i === active && 'bg-canvas',
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-ink">{o.label}</span>
                      {o.sub ? <span className="block truncate text-xs text-muted">{o.sub}</span> : null}
                    </span>
                    {o.value === value ? <Check className="h-4 w-4 shrink-0 text-brand-600" /> : null}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
