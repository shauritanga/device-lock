import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/api/client';
import type { Payout, PayoutAccountChange, PayoutSummary } from '@/shared/api/types';
import { FigureStrip } from '@/shared/components/FigureStrip';
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

  const section = (title: string, body: ReactNode) => (
    <section>
      <h2 className="mb-2 px-1 text-xs font-medium uppercase tracking-wide text-faint">{title}</h2>
      {body}
    </section>
  );

  return (
    <div className="space-y-8">
      {section(
        'Payout account',
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
            {summary.isLoading ? (
              <Spinner />
            ) : hasAccount ? (
              <dl className="flex flex-wrap gap-x-10 gap-y-3">
                <div>
                  <dt className="text-xs text-muted">Registered name</dt>
                  <dd className="mt-1 text-sm font-medium text-ink">{s!.tenant.payoutName}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Mobile-money number</dt>
                  <dd className="mt-1 font-mono text-sm text-ink">{s!.tenant.payoutPhone}</dd>
                </div>
              </dl>
            ) : (
              <p className="text-sm text-muted">
                No account set. Money collected for this company waits until you add one.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => disburse.mutate()}
                disabled={disburse.isPending || !hasAccount}
                title="Send everything currently owed to this company"
              >
                {disburse.isPending ? 'Sending…' : 'Pay out now'}
              </Button>
              <Button
                type="button"
                variant={hasAccount ? 'secondary' : 'primary'}
                onClick={() => {
                  save.reset();
                  setEditOpen(true);
                }}
                disabled={summary.isLoading}
              >
                {hasAccount ? 'Edit account' : 'Set account'}
              </Button>
            </div>
          </div>
          {s?.holdUntil ? (
            <p className="border-t border-line px-5 py-3 text-sm text-amber-700">
              Payouts are paused until {new Date(s.holdUntil).toLocaleString('en-GB')} because the
              payout number was recently changed.
            </p>
          ) : null}
          {disburse.isSuccess ? (
            <p className="border-t border-line px-5 py-3 text-sm text-muted">
              {disburse.data.payoutId
                ? 'Payout sent — status will update shortly.'
                : (SKIP_TEXT[disburse.data.skipped ?? ''] ?? 'Nothing to send.')}
            </p>
          ) : null}
          {disburse.isError ? (
            <p className="border-t border-line px-5 py-3 text-sm text-rose-600">
              {errorText(disburse.error)}
            </p>
          ) : null}
        </Card>,
      )}

      <FigureStrip
        items={[
          {
            label: 'Awaiting payout',
            value: money(s?.owed ?? 0),
            hint: s?.owedCount ? `${s.owedCount} payment${s.owedCount === 1 ? '' : 's'}` : undefined,
          },
          { label: 'On its way', value: money(s?.inFlight ?? 0) },
          {
            label: 'Paid out',
            value: money(s?.paidOut ?? 0),
            hint: s?.failedCount ? `${s.failedCount} failed` : undefined,
          },
        ]}
      />

      {section(
        'Payout history',
        <Card className="p-3">
          <PayoutsTable payouts={payouts.data ?? []} />
        </Card>,
      )}

      {section(
        'Account changes',
        <Card className="p-3">
          <PayoutAccountHistory changes={history.data ?? []} />
        </Card>,
      )}

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
