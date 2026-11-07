import { Breadcrumbs } from '@/shared/components/Breadcrumbs';
import { StatusDot } from '@/shared/components/ui/Pill';
import { cn } from '@/shared/lib/cn';
import { shortDate } from '@/shared/lib/format';
import type { TabId } from './types';

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'billing', label: 'Billing' },
  { id: 'payouts', label: 'Payouts' },
  { id: 'agreement', label: 'Agreement' },
];

/** Breadcrumb, company name with one line of context, and plain section tabs. */
export function CompanyHeader({
  name,
  country,
  createdAt,
  isActive,
  tab,
  onTab,
  hidden = [],
}: {
  name: string;
  country?: string;
  createdAt?: string;
  isActive?: boolean;
  tab: TabId;
  onTab: (t: TabId) => void;
  hidden?: TabId[];
}) {
  const meta = [createdAt ? `Joined ${shortDate(createdAt)}` : null, country].filter(Boolean);

  return (
    <header className="space-y-4">
      <Breadcrumbs items={[{ label: 'Companies', to: '/companies' }, { label: name }]} />

      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{name}</h1>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
          <StatusDot
            status={isActive === false ? 'INACTIVE' : 'ACTIVE'}
            label={isActive === false ? 'Suspended' : 'Active'}
          />
          {meta.map((m) => (
            <span key={m} className="before:mr-3 before:text-faint before:content-['·']">
              {m}
            </span>
          ))}
        </div>
      </div>

      <nav
        className="-mx-1 flex gap-6 overflow-x-auto overflow-y-hidden border-b border-line px-1"
        aria-label="Company sections"
      >
        {TABS.filter((t) => !hidden.includes(t.id)).map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => onTab(id)}
            aria-current={tab === id ? 'page' : undefined}
            className={cn(
              'shrink-0 border-b-2 pb-3 pt-1 text-sm font-medium transition',
              tab === id
                ? 'border-ink text-ink'
                : 'border-transparent text-muted hover:text-ink',
            )}
          >
            {label}
          </button>
        ))}
      </nav>
    </header>
  );
}
