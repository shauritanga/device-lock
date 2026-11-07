import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Banknote, Hourglass, Pencil, Send, Smartphone } from 'lucide-react';
import { api } from '@/shared/api/client';
import type { Payout, PayoutSummary } from '@/shared/api/types';
import { StatCard } from '@/shared/components/StatCard';
import { PayoutsTable } from '@/shared/components/PayoutsTable';
import { Button } from '@/shared/components/ui/Button';
import { Card } from '@/shared/components/ui/Card';
import { Field, Input } from '@/shared/components/ui/Field';
import { Modal } from '@/shared/components/ui/Modal';
import { Spinner } from '@/shared/components/ui/misc';
import { money } from '@/shared/lib/format';

/** Matches the backend rule: 07XXXXXXXX, 255XXXXXXXXX or +255XXXXXXXXX (mobile). */
const TZ_MOBILE = /^(\+?255|0)[67]\d{8}$/;

function errorText(e: unknown): string {
  const msg = (e as { response?: { data?: { message?: string | string[] } } })
    ?.response?.data?.message;
  return Array.isArray(msg) ? msg.join(', ') : (msg ?? 'Something went wrong.');
}

/**
 * Where this company's collected instalments are paid out, plus payout history.
 * Super admin only: the endpoints behind it are restricted to that role.
 */
export function PayoutAccountCard({ tenantId }: { tenantId: string }) {
  const qc = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');

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

  const refresh = () => qc.invalidateQueries({ queryKey: ['payouts'] });

  const save = useMutation({
    mutationFn: async () =>
      (
        await api.patch(`/tenants/${tenantId}`, {
          payoutPhone: phone.trim(),
          payoutName: name.trim(),
        })
      ).data,
    onSuccess: () => {
      refresh();
      qc.invalidateQueries({ queryKey: ['tenants', tenantId] });
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
  const phoneOk = TZ_MOBILE.test(phone.trim());
  const SKIP_TEXT: Record<string, string> = {
    below_minimum: `Nothing sent — owed amount is below the ${money(s?.minimumPayout ?? 5000)} minimum (after the payout fee).`,
    no_payout_account: 'Nothing sent — set a payout account first.',
    snippe_not_configured: 'Nothing sent — the payment gateway is not configured.',
    already_running: 'A payout run is already in progress.',
  };

  return (
    <div className="space-y-4">
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
                setPhone(s?.tenant.payoutPhone ?? '');
                setName(s?.tenant.payoutName ?? '');
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

      <Card className="p-3">
        <PayoutsTable payouts={payouts.data ?? []} />
      </Card>

      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Payout account"
        className="max-w-md"
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (phoneOk) save.mutate();
          }}
        >
          <p className="text-sm text-muted">
            Collected instalments for{' '}
            <span className="font-medium text-ink">{s?.tenant.name}</span> are sent to this
            mobile-money account.
          </p>
          <Field label="Mobile-money number">
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0712345678 or 255712345678"
              inputMode="tel"
              required
            />
            {phone.trim() !== '' && !phoneOk ? (
              <p className="mt-1 text-xs text-rose-600">
                Enter a Tanzanian mobile number (07… / 06… / 255…).
              </p>
            ) : null}
          </Field>
          <Field label="Registered name on the account">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name as registered with the network"
              minLength={2}
              required
            />
          </Field>
          <div className="flex flex-wrap gap-2 border-t border-line pt-4">
            <Button type="submit" disabled={save.isPending || !phoneOk || name.trim().length < 2}>
              {save.isPending ? 'Saving…' : 'Save account'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
          </div>
          {save.isError ? <p className="text-sm text-rose-600">{errorText(save.error)}</p> : null}
        </form>
      </Modal>
    </div>
  );
}
