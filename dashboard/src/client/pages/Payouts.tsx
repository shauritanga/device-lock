import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, ShieldAlert, Smartphone } from '@/shared/icons';
import { api } from '@/shared/api/client';
import type { Payout, PayoutAccountChange, PayoutSummary } from '@/shared/api/types';
import { useAuth } from '@/shared/auth/AuthContext';
import { PayoutAccountHistory } from '@/shared/components/PayoutAccountHistory';
import {
  PayoutAccountModal,
  type AccountForm,
} from '@/shared/components/PayoutAccountModal';
import { Button } from '@/shared/components/ui/Button';
import { FigureStrip } from '@/shared/components/FigureStrip';
import { ListToolbar } from '@/shared/components/ListToolbar';
import { PanelEmpty } from '@/shared/components/Panel';
import { Tabs } from '@/shared/components/Tabs';
import { PayoutsTable } from '@/shared/components/PayoutsTable';
import { Card } from '@/shared/components/ui/Card';
import { Center, Spinner } from '@/shared/components/ui/misc';
import { money, shortDate } from '@/shared/lib/format';

export default function Payouts() {
  const { user } = useAuth();
  const isOwner = user?.role === 'OWNER';
  const qc = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [tab, setTab] = useState<'payouts' | 'changes'>('payouts');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('ALL');
  const summary = useQuery({
    queryKey: ['payouts', 'summary'],
    queryFn: async () => (await api.get<PayoutSummary>('/payouts/summary')).data,
  });
  const payouts = useQuery({
    queryKey: ['payouts'],
    queryFn: async () => (await api.get<Payout[]>('/payouts')).data,
  });

  const history = useQuery({
    queryKey: ['payouts', 'account-history'],
    queryFn: async () =>
      (await api.get<PayoutAccountChange[]>('/payouts/account-history')).data,
    enabled: isOwner,
  });

  const save = useMutation({
    mutationFn: async (f: AccountForm) =>
      (await api.put('/payouts/account', f)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payouts'] });
      setEditOpen(false);
    },
  });

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (payouts.data ?? []).filter((p) => {
      if (status !== 'ALL' && p.status !== status) return false;
      if (!q) return true;
      return [p.recipientName, p.recipientPhone].filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
    });
  }, [payouts.data, query, status]);

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
    <div className="space-y-6">
      <Card className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
            <Smartphone className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-muted">Payout account</p>
            {hasAccount ? (
              <>
                <p className="text-base font-semibold text-ink">
                  {s!.tenant.payoutName}
                </p>
                <p className="font-mono text-sm text-muted">{s!.tenant.payoutPhone}</p>
              </>
            ) : (
              <p className="text-sm font-medium text-amber-700">
                No payout account set — collected money is held until one is added.
              </p>
            )}
          </div>
          {isOwner ? (
            <Button
              type="button"
              onClick={() => {
                save.reset();
                setEditOpen(true);
              }}
            >
              <Pencil className="h-4 w-4" />
              {hasAccount ? 'Change account' : 'Add account'}
            </Button>
          ) : null}
        </div>
        {s?.holdUntil ? (
          <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            Payouts are paused until {new Date(s.holdUntil).toLocaleString('en-GB')} because
            the payout number was changed. This protects your money if an account is ever
            misused. Collected money is safe and will be sent after that.
          </p>
        ) : null}
        {s?.lastChange ? (
          <p className="mt-2 text-xs text-muted">
            Last changed {shortDate(s.lastChange.createdAt)} by {s.lastChange.changedByName}.
          </p>
        ) : null}
        <p className="mt-3 border-t border-line pt-3 text-xs text-muted">
          Customer payments are collected for you and sent to this mobile-money
          account as soon as they clear. Payouts of{' '}
          {money(s?.minimumPayout ?? 5000)} or more are sent automatically; smaller
          amounts wait until they add up. A small gateway fee is deducted from each
          payout. {isOwner ? 'Only the company owner can change the account.' : 'Only the company owner can change the account — ask them to update it.'}
        </p>
      </Card>

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

      {isOwner ? (
        <Tabs
          label="Payout sections"
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'payouts', label: 'Payouts', count: payouts.data?.length },
            { id: 'changes', label: 'Account changes', count: history.data?.length },
          ]}
        />
      ) : null}

      {tab === 'payouts' || !isOwner ? (
        <Card>
          <ListToolbar
            title="Payout history"
            noun="payout"
            count={rows.length}
            query={query}
            onQuery={setQuery}
            placeholder="Search recipient or number"
            filter={{
              value: status,
              onChange: setStatus,
              options: [
                { value: 'ALL', label: 'All statuses' },
                { value: 'COMPLETED', label: 'Completed' },
                { value: 'PENDING', label: 'Pending' },
                { value: 'FAILED', label: 'Failed' },
                { value: 'REVERSED', label: 'Reversed' },
              ],
            }}
          />
          {payouts.data && payouts.data.length > 0 && rows.length === 0 ? (
            <PanelEmpty>No payouts match your search.</PanelEmpty>
          ) : (
            <PayoutsTable payouts={rows} />
          )}
        </Card>
      ) : (
        <Card>
          <PayoutAccountHistory changes={history.data ?? []} />
        </Card>
      )}

      <PayoutAccountModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        initial={{ phone: s?.tenant.payoutPhone ?? '', name: s?.tenant.payoutName ?? '' }}
        requirePassword
        holdNotice={
          s?.holdHours
            ? `After you change the number, payouts pause for ${s.holdHours} hours as a safety measure, then continue to the new number. We'll alert the owners by email.`
            : "We'll alert the owners by email when the payout number is changed."
        }
        pending={save.isPending}
        error={save.error}
        onSubmit={(f) => save.mutate(f)}
      />
    </div>
  );
}
