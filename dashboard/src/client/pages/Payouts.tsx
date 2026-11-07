import { useQuery } from '@tanstack/react-query';
import { Banknote, Clock, Hourglass, Smartphone } from 'lucide-react';
import { api } from '@/shared/api/client';
import type { Payout, PayoutSummary } from '@/shared/api/types';
import { StatCard } from '@/shared/components/StatCard';
import { PayoutsTable } from '@/shared/components/PayoutsTable';
import { Card } from '@/shared/components/ui/Card';
import { Center, Spinner } from '@/shared/components/ui/misc';
import { money } from '@/shared/lib/format';

export default function Payouts() {
  const summary = useQuery({
    queryKey: ['payouts', 'summary'],
    queryFn: async () => (await api.get<PayoutSummary>('/payouts/summary')).data,
  });
  const payouts = useQuery({
    queryKey: ['payouts'],
    queryFn: async () => (await api.get<Payout[]>('/payouts')).data,
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
        </div>
        <p className="mt-3 border-t border-line pt-3 text-xs text-muted">
          Customer payments are collected for you and sent to this mobile-money
          account as soon as they clear. Payouts of{' '}
          {money(s?.minimumPayout ?? 5000)} or more are sent automatically; smaller
          amounts wait until they add up. A small gateway fee is deducted from each
          payout. To change the account, contact the platform team.
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
    </div>
  );
}
