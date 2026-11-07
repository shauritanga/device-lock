import { Search } from '@/shared/icons';
import { Input, Select } from './ui/Field';

/** Panel heading for a searchable list: title, count, search box and optional filter. */
export function ListToolbar({
  title,
  count,
  noun,
  query,
  onQuery,
  placeholder,
  filter,
}: {
  title: string;
  count: number;
  /** Singular noun, e.g. "payment". */
  noun: string;
  query: string;
  onQuery: (v: string) => void;
  placeholder: string;
  filter?: {
    value: string;
    onChange: (v: string) => void;
    options: { value: string; label: string }[];
  };
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-line-soft px-5 pb-3.5 pt-[18px] sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h3 className="text-sm font-semibold tracking-[-0.2px] text-ink">{title}</h3>
        <p className="mt-0.5 text-xs text-faint">
          {count} {count === 1 ? noun : `${noun}s`}
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <Input
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder={placeholder}
            className="!w-full !pl-9 sm:!w-64"
          />
        </div>
        {filter ? (
          <Select value={filter.value} onChange={(e) => filter.onChange(e.target.value)} className="sm:!w-44">
            {filter.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        ) : null}
      </div>
    </div>
  );
}
