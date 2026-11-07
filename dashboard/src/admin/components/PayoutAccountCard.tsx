import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Banknote, Hourglass, Pencil, Send, Smartphone } from 'lucide-react';
import { api } from '@/shared/api/client';
import type { Payout, PayoutAccountChange, PayoutSummary } from '@/shared/api/types';
import { StatCard } from '@/shared/components/StatCard';
import { PayoutsTable } from '@/shared/components/PayoutsTable';
import { Button } from '@/shared/components/ui/Button';
import { Card } from '@/shared/components/ui/Card';
import { PayoutAccountHistory } from '@/shared/components/PayoutAccountHistory';
import {
  PayoutAccountModal,
  apiErrorText as errorText,
  type AccountForm,
} from '@/shared/components/PayoutAccountModal';
import { Spinner } from '@/shared/components/ui/misc';
import { money } from '@/shared/lib/format';

/**
 * Where this company's collected instalments are paid out, plus payout history.
 * Super admin only: the endpoints behind it are restricted to that role.
 */
export function PayoutAccountCard({ tenantId }: { tenantId: string }) {
  const qc = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);

  const summary = useQuery({
    queryKey: ['payouts', 'summary', tenantId],
    queryFn: async () =>
      (await api.get<PayoutSummary>(`/payouts/summary?tenantId=${tenantId}`)).data,
  });
  const payouts = useQuery({
    queryKey: ['payouts', 'list', tenantId],
    queryFn: async () =>
      (await api.get<Payout[]>(`/payouts?tenantId=${tenantId}`)).data,
  });

  const history = useQuery({
    queryKey: ['payouts', 'account-history', tenantId],
    queryFn: async () =>
      (await api.get<PayoutAccountChange[]>(`/payouts/account-history?tenantId=${tenantId}`)).data,
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['payouts'] });

  const save = useMutation({
    mutationFn: async (f: AccountForm) =>
      (
        await api.put(`/payouts/tenants/${tenantId}/account`, {
          phone: f.phone,
          name: f.name,
        })
      ).data,
    onSuccess: () => {
      refresh();
      setEditOpen(false);
    },
  });

  const disburse = useMutation({
    mutationFn: async () =>
      (
        await api.post<{ payoutId?: string; skipped?: string }>(
          `/payouts/tenants/${tenantId}/disburse`,
        )
      ).data,
    onSuccess: refresh,
  });

  const s = summary.data;
  const hasAccount = !!(s?.tenant.payoutPhone && s.tenant.payoutName);
  const SKIP_TEXT: Record<string, string> = {
    below_minimum: `Nothing sent — owed amount is below the ${money(s?.minimumPayout ?? 5000)} minimum (after the payout fee).`,
    no_payout_account: 'Nothing sent — set a payout account first.',
    snippe_not_configured: 'Nothing sent — the payment gateway is not configured.',
    already_running: 'A payout run is already in progress.',
    account_on_hold: 'Nothing sent — payouts are paused after a recent payout-number change.',
  };

  return (
    <div className="space-y-6">
      <Card className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
            <Smartphone className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-muted">Payout account</p>
            {summary.isLoading ? (
              <Spinner />
            ) : hasAccount ? (
              <>
                <p className="text-base font-semibold text-ink">{s!.tenant.payoutName}</p>
                <p className="font-mono text-sm text-muted">{s!.tenant.payoutPhone}</p>
              </>
            ) : (
              <p className="text-sm font-medium text-amber-700">
                Not set — collected money for this company is held until you add an account.
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => disburse.mutate()}
              disabled={disburse.isPending || !hasAccount}
              title="Send everything currently owed to this company"
            >
              <Send className="h-4 w-4" />
              {disburse.isPending ? 'Sending…' : 'Pay out now'}
            </Button>
            <Button
              type="button"
              onClick={() => {
                save.reset();
                setEditOpen(true);
              }}
              disabled={summary.isLoading}
            >
              <Pencil className="h-4 w-4" />
              {hasAccount ? 'Edit account' : 'Set account'}
            </Button>
          </div>
        </div>
        {disburse.isSuccess ? (
          <p className="mt-3 text-sm text-muted">
            {disburse.data.payoutId
              ? 'Payout sent — status will update shortly.'
              : (SKIP_TEXT[disburse.data.skipped ?? ''] ?? 'Nothing to send.')}
          </p>
        ) : null}
        {disburse.isError ? (
          <p className="mt-3 text-sm text-rose-600">{errorText(disburse.error)}</p>
        ) : null}
        {s?.holdUntil ? (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
            Payouts paused until {new Date(s.holdUntil).toLocaleString('en-GB')} — the owner
            recently changed the payout number.
          </p>
        ) : null}
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          icon={Hourglass}
          label="Awaiting payout"
          value={money(s?.owed ?? 0)}
          hint={s?.owedCount ? `${s.owedCount} payment${s.owedCount === 1 ? '' : 's'}` : undefined}
          tone="amber"
        />
        <StatCard icon={Send} label="On its way" value={money(s?.inFlight ?? 0)} tone="brand" />
        <StatCard
          icon={Banknote}
          label="Paid out"
          value={money(s?.paidOut ?? 0)}
          hint={s?.failedCount ? `${s.failedCount} failed` : undefined}
          tone="green"
        />
      </div>

      <div className="space-y-2">
        <h3 className="px-1 text-sm font-semibold text-ink">Payout history</h3>
        <Card className="p-3">
          <PayoutsTable payouts={payouts.data ?? []} />
        </Card>
      </div>

      <div className="space-y-2">
        <h3 className="px-1 text-sm font-semibold text-ink">Account changes</h3>
        <Card className="p-3">
          <PayoutAccountHistory changes={history.data ?? []} />
        </Card>
      </div>

      <PayoutAccountModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        company={s?.tenant.name}
        initial={{ phone: s?.tenant.payoutPhone ?? '', name: s?.tenant.payoutName ?? '' }}
        requirePassword={false}
        pending={save.isPending}
        error={save.error}
        onSubmit={(f) => save.mutate(f)}
      />
    </div>
  );
}
