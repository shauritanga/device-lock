import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Banknote, Clock, Hourglass, Pencil, ShieldAlert, Smartphone } from 'lucide-react';
import { api } from '@/shared/api/client';
import type { Payout, PayoutAccountChange, PayoutSummary } from '@/shared/api/types';
import { useAuth } from '@/shared/auth/AuthContext';
import { PayoutAccountHistory } from '@/shared/components/PayoutAccountHistory';
import {
  PayoutAccountModal,
  type AccountForm,
} from '@/shared/components/PayoutAccountModal';
import { Button } from '@/shared/components/ui/Button';
import { StatCard } from '@/shared/components/StatCard';
import { PayoutsTable } from '@/shared/components/PayoutsTable';
import { Card } from '@/shared/components/ui/Card';
import { Center, Spinner } from '@/shared/components/ui/misc';
import { money, shortDate } from '@/shared/lib/format';

export default function Payouts() {
  const { user } = useAuth();
  const isOwner = user?.role === 'OWNER';
  const qc = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          icon={Hourglass}
          label="Awaiting payout"
          value={money(s?.owed ?? 0)}
          hint={s?.owedCount ? `${s.owedCount} payment${s.owedCount === 1 ? '' : 's'}` : undefined}
          tone="amber"
        />
        <StatCard
          icon={Clock}
          label="On its way"
          value={money(s?.inFlight ?? 0)}
          tone="brand"
        />
        <StatCard
          icon={Banknote}
          label="Paid out"
          value={money(s?.paidOut ?? 0)}
          tone="green"
        />
      </div>

      <Card className="p-3">
        <PayoutsTable payouts={payouts.data ?? []} />
      </Card>

      {isOwner ? (
        <div className="space-y-2">
          <h2 className="px-1 text-sm font-semibold text-ink">Account changes</h2>
          <Card className="p-3">
            <PayoutAccountHistory changes={history.data ?? []} />
          </Card>
        </div>
      ) : null}

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
