import { ArrowLeft, Banknote, CalendarDays, CreditCard, FileSignature, Globe, LayoutDashboard } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card } from '@/shared/components/ui/Card';
import { Pill, StatusPill } from '@/shared/components/ui/Pill';
import { cn } from '@/shared/lib/cn';
import { initials, shortDate } from '@/shared/lib/format';
import type { TabId } from './types';

const TABS: { id: TabId; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'billing', label: 'Billing', icon: CreditCard },
  { id: 'payouts', label: 'Payouts', icon: Banknote },
  { id: 'agreement', label: 'Agreement', icon: FileSignature },
];

/** Company identity banner with the section tabs along its bottom edge. */
export function CompanyHeader({
  name,
  country,
  createdAt,
  isActive,
  subscriptionStatus,
  packageCode,
  tab,
  onTab,
  hidden = [],
}: {
  name: string;
  country?: string;
  createdAt?: string;
  isActive?: boolean;
  subscriptionStatus: string;
  packageCode?: string | null;
  tab: TabId;
  onTab: (t: TabId) => void;
  hidden?: TabId[];
}) {
  return (
    <div className="space-y-3">
      <Link
        to="/companies"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" />
        Companies
      </Link>

      <Card className="overflow-hidden">
        <div className="bg-gradient-to-r from-brand-500/10 via-brand-500/5 to-transparent px-5 pb-5 pt-6 sm:px-7">
          <div className="flex flex-wrap items-center gap-4">
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-xl font-bold text-white shadow-card">
              {initials(name) || '·'}
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-2xl font-bold tracking-tight text-ink">{name}</h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
                {createdAt ? (
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5" aria-hidden />
                    Joined {shortDate(createdAt)}
                  </span>
                ) : null}
                {country ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Globe className="h-3.5 w-3.5" aria-hidden />
                    {country}
                  </span>
                ) : null}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone={isActive === false ? 'gray' : 'green'}>
                {isActive === false ? 'Suspended' : 'Account active'}
              </Pill>
              <StatusPill status={subscriptionStatus} />
              {packageCode ? <Pill tone="brand">{packageCode}</Pill> : null}
            </div>
          </div>
        </div>

        <nav
          className="flex gap-1 overflow-x-auto overflow-y-hidden border-t border-line px-3 sm:px-5"
          aria-label="Company sections"
        >
          {TABS.filter((t) => !hidden.includes(t.id)).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => onTab(id)}
              aria-current={tab === id ? 'page' : undefined}
              className={cn(
                'inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium transition',
                tab === id
                  ? 'border-brand-600 text-brand-700'
                  : 'border-transparent text-muted hover:text-ink',
              )}
            >
              <Icon className="h-4 w-4" aria-hidden />
              {label}
            </button>
          ))}
        </nav>
      </Card>
    </div>
  );
}
