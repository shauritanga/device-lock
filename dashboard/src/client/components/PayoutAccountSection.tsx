import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, ShieldAlert, Smartphone } from '@/shared/icons';
import { api } from '@/shared/api/client';
import type { PayoutAccountChange, PayoutSummary } from '@/shared/api/types';
import { useAuth } from '@/shared/auth/AuthContext';
import { PayoutAccountHistory } from '@/shared/components/PayoutAccountHistory';
import { PayoutAccountModal, type AccountForm } from '@/shared/components/PayoutAccountModal';
import { PanelHeader } from '@/shared/components/Panel';
import { Button } from '@/shared/components/ui/Button';
import { Card } from '@/shared/components/ui/Card';
import { Spinner } from '@/shared/components/ui/misc';
import { money, shortDate } from '@/shared/lib/format';

/** Where the seller's payout account lives: view, change (owner only) and audit trail. */
export function PayoutAccountSection() {
  const { user } = useAuth();
  const isOwner = user?.role === 'OWNER';
  const qc = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);

  const summary = useQuery({
    queryKey: ['payouts', 'summary'],
    queryFn: async () => (await api.get<PayoutSummary>('/payouts/summary')).data,
  });
  const history = useQuery({
    queryKey: ['payouts', 'account-history'],
    queryFn: async () => (await api.get<PayoutAccountChange[]>('/payouts/account-history')).data,
    enabled: isOwner,
  });
  const save = useMutation({
    mutationFn: async (f: AccountForm) => (await api.put('/payouts/account', f)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payouts'] });
      setEditOpen(false);
    },
  });

  const s = summary.data;
  const hasAccount = !!(s?.tenant.payoutPhone && s.tenant.payoutName);

  return (
    <section className="space-y-4">
      <Card>
        <PanelHeader title="Payout account" sub="Where customer payments are sent" />
        {summary.isLoading ? (
          <div className="flex justify-center p-8"><Spinner /></div>
        ) : (
          <div className="space-y-4 p-5">
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
                <Smartphone className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                {hasAccount ? (
                  <>
                    <p className="text-base font-semibold text-ink">{s!.tenant.payoutName}</p>
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
              <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                Payouts are paused until {new Date(s.holdUntil).toLocaleString('en-GB')} because the
                payout number was changed. Collected money is safe and will be sent after that.
              </p>
            ) : null}
            {s?.lastChange ? (
              <p className="text-xs text-muted">
                Last changed {shortDate(s.lastChange.createdAt)} by {s.lastChange.changedByName}.
              </p>
            ) : null}
            <p className="border-t border-line-soft pt-4 text-xs text-muted">
              Customer payments are collected for you and sent to this mobile-money account as soon as
              they clear. Payouts of {money(s?.minimumPayout ?? 5000)} or more are sent automatically;
              smaller amounts wait until they add up. A small gateway fee is deducted from each payout.{' '}
              {isOwner
                ? 'Only the company owner can change the account.'
                : 'Only the company owner can change the account — ask them to update it.'}
            </p>
          </div>
        )}
      </Card>

      {isOwner ? (
        <Card>
          <PanelHeader title="Account changes" sub="Who changed the payout account, and when" />
          <PayoutAccountHistory changes={history.data ?? []} />
        </Card>
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
    </section>
  );
}
