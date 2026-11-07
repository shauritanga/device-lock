import { Tabs } from '@/shared/components/Tabs';
import type { TabId } from './types';

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'billing', label: 'Billing' },
  { id: 'payouts', label: 'Payouts' },
  { id: 'agreement', label: 'Agreement' },
];

/** Section tabs for a company. The breadcrumb (with the name) is in the top bar. */
export function CompanyHeader({
  tab,
  onTab,
  hidden = [],
}: {
  tab: TabId;
  onTab: (t: TabId) => void;
  hidden?: TabId[];
}) {
  return (
    <Tabs
      label="Company sections"
      tabs={TABS.filter((t) => !hidden.includes(t.id))}
      value={tab}
      onChange={onTab}
    />
  );
}
