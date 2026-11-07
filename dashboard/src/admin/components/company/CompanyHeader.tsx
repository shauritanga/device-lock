import { Breadcrumbs } from '@/shared/components/Breadcrumbs';
import { cn } from '@/shared/lib/cn';
import type { TabId } from './types';

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'billing', label: 'Billing' },
  { id: 'payouts', label: 'Payouts' },
  { id: 'agreement', label: 'Agreement' },
];

/** Breadcrumb (it carries the company name) and plain section tabs. */
export function CompanyHeader({
  name,
  tab,
  onTab,
  hidden = [],
}: {
  name: string;
  tab: TabId;
  onTab: (t: TabId) => void;
  hidden?: TabId[];
}) {
  return (
    <header className="space-y-4">
      <Breadcrumbs items={[{ label: 'Companies', to: '/companies' }, { label: name }]} />

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
