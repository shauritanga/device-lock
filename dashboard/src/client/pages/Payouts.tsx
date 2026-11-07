import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ShieldAlert } from '@/shared/icons';
import { api } from '@/shared/api/client';
import type { Payout, PayoutSummary } from '@/shared/api/types';
import { FigureStrip } from '@/shared/components/FigureStrip';
import { ListToolbar } from '@/shared/components/ListToolbar';
import { PanelEmpty } from '@/shared/components/Panel';
import { PayoutsTable } from '@/shared/components/PayoutsTable';
import { Tabs } from '@/shared/components/Tabs';
import { Card } from '@/shared/components/ui/Card';
import { Center, Spinner } from '@/shared/components/ui/misc';
import { money } from '@/shared/lib/format';

type StatusTab = 'ALL' | 'COMPLETED' | 'PENDING' | 'FAILED';

export default function Payouts() {
  const [tab, setTab] = useState<StatusTab>('ALL');
  const [query, setQuery] = useState('');
  const summary = useQuery({
    queryKey: ['payouts', 'summary'],
    queryFn: async () => (await api.get<PayoutSummary>('/payouts/summary')).data,
  });
  const payouts = useQuery({
    queryKey: ['payouts'],
    queryFn: async () => (await api.get<Payout[]>('/payouts')).data,
  });

  const all = payouts.data ?? [];
  const count = (st: string) => all.filter((p) => p.status === st).length;

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter((p) => {
      if (tab !== 'ALL' && p.status !== tab) return false;
      if (!q) return true;
      return [p.recipientName, p.recipientPhone].filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
    });
  }, [all, query, tab]);

  if (summary.isLoading || payouts.isLoading) {
    return (
      <Center>
        <Spinner />
      </Center>
    );
  }

  const s = summary.data;
  const hasAccount = !!(s?.tenant.payoutPhone && s.tenant.payoutName);

  return (
    <div className="space-y-5">
      {!hasAccount || s?.holdUntil ? (
        <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {!hasAccount
              ? 'No payout account set — collected money is held until one is added.'
              : `Payouts are paused until ${new Date(s!.holdUntil!).toLocaleString('en-GB')} because the payout number was changed.`}{' '}
            <Link to="/settings" className="font-medium underline">
              Open settings
            </Link>
          </span>
        </p>
      ) : null}

      <FigureStrip
        items={[
          {
            label: 'Awaiting payout',
            value: money(s?.owed ?? 0),
            hint: s?.owedCount ? `${s.owedCount} payment${s.owedCount === 1 ? '' : 's'}` : undefined,
          },
          { label: 'On its way', value: money(s?.inFlight ?? 0) },
          { label: 'Paid out', value: money(s?.paidOut ?? 0) },
        ]}
      />

      <Tabs
        label="Payout status"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'ALL', label: 'All', count: all.length },
          { id: 'COMPLETED', label: 'Completed', count: count('COMPLETED') },
          { id: 'PENDING', label: 'Pending', count: count('PENDING') },
          { id: 'FAILED', label: 'Failed', count: count('FAILED') },
        ]}
      />

      <Card>
        <ListToolbar
          title="Payout history"
          noun="payout"
          count={rows.length}
          query={query}
          onQuery={setQuery}
          placeholder="Search recipient or number"
        />
        {all.length > 0 && rows.length === 0 ? (
          <PanelEmpty>No payouts match.</PanelEmpty>
        ) : (
          <PayoutsTable payouts={rows} />
        )}
      </Card>
    </div>
  );
}
