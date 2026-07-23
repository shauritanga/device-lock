import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Headphones, Send } from 'lucide-react';
import { api } from '@/shared/api/client';
import { Card, CardHeader } from '@/shared/components/ui/Card';
import { Pill, StatusPill } from '@/shared/components/ui/Pill';
import { EmptyState } from '@/shared/components/ui/misc';
import { Button } from '@/shared/components/ui/Button';
import { Field, Input, Select } from '@/shared/components/ui/Field';
import { CaseList, type CollectionCase } from '@/shared/components/CaseList';
import { money, shortDate } from '@/shared/lib/format';

type PackageDef = {
  code: string;
  label: string;
  deviceBandMin: number;
  deviceBandMax: number;
  priceModel: string;
  unitPrice: number | null;
  flatPrice: number | null;
  currency: string;
};

type MySubscription = {
  subscription: { packageCode: string; status: string } | null;
  activeDevices: number;
  suggestedPackage?: string | null;
};

type Activity = {
  totals: { contacts: number; promises: number; collectorsActive: number };
  byCollector: Array<{
    collectorName: string;
    contacts: number;
    calls: number;
    sms: number;
    wa: number;
  }>;
  recentContacts: Array<{
    id: string;
    channel: string;
    verificationStatus: string;
    initiatedAt: string;
    collectorName: string;
    customerName: string;
    caseId: string;
  }>;
};

type ReferableLoan = {
  loanId: string;
  customerName: string | null;
  customerPhone: string | null;
  deviceImei: string | null;
  deviceModel: string | null;
  nextDueDate: string | null;
  amountDue: number;
  isOverdue: boolean;
  daysOverdue: number;
  caseId: string | null;
  caseStatus: string | null;
  caseSource: string | null;
  referredAt: string | null;
};

type Invoice = {
  id: string;
  periodStart: string;
  periodEnd: string;
  packageCode: string;
  activeDevices: number;
  total: string | number;
  status: string;
  dueDate: string;
  paidAt?: string | null;
  tenant: { name: string };
};

/**
 * Seller-facing view of the managed collections service. Read-only by design:
 * platform collectors do the follow-up, the seller sees what they are paying
 * for and what it produced. Working a queue happens in the admin console only.
 */
export default function CollectionsService() {
  const qc = useQueryClient();
  const [loanId, setLoanId] = useState('');
  const [note, setNote] = useState('');

  const packages = useQuery({
    queryKey: ['collections', 'packages'],
    queryFn: async () => (await api.get<PackageDef[]>('/collections/packages')).data,
  });

  const mySub = useQuery({
    queryKey: ['collections', 'subscriptions', 'me'],
    queryFn: async () => (await api.get<MySubscription>('/collections/subscriptions/me')).data,
  });

  const cases = useQuery({
    queryKey: ['collections', 'cases', 'seller'],
    queryFn: async () => (await api.get<CollectionCase[]>('/collections/cases')).data,
  });

  const activity = useQuery({
    queryKey: ['collections', 'activity', 'me'],
    queryFn: async () =>
      (await api.get<Activity>('/collections/activity/me', { params: { days: 7 } })).data,
  });

  const invoices = useQuery({
    queryKey: ['collections', 'invoices'],
    queryFn: async () => (await api.get<Invoice[]>('/collections/invoices')).data,
  });

  const referable = useQuery({
    queryKey: ['collections', 'cases', 'referable'],
    queryFn: async () =>
      (await api.get<ReferableLoan[]>('/collections/cases/referable')).data,
  });

  const refer = useMutation({
    mutationFn: async () =>
      (await api.post('/collections/cases/refer', { loanId, note: note || undefined }))
        .data,
    onSuccess: () => {
      setLoanId('');
      setNote('');
      qc.invalidateQueries({ queryKey: ['collections'] });
    },
  });

  const sub = mySub.data;
  const isActive = sub?.subscription?.status === 'ACTIVE';
  const pending = (referable.data ?? []).filter((l) => !l.caseId);
  const handedOver = (referable.data ?? []).filter(
    (l) => l.caseSource === 'SELLER_HANDOFF',
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted">
        <Headphones className="h-4 w-4" />
        Managed collections — our collectors follow up your overdue accounts
      </div>

      <Card className="p-5">
        <p className="text-sm font-medium text-muted">Your collections service</p>
        <p className="mt-1 text-lg font-semibold">
          {sub?.subscription
            ? `${sub.subscription.packageCode} · ${sub.subscription.status}`
            : 'Not subscribed'}
        </p>
        <p className="mt-1 text-sm text-muted">
          Active devices: {sub?.activeDevices ?? '—'}
          {sub?.suggestedPackage ? ` · Suggested package: ${sub.suggestedPackage}` : ''}
        </p>
        {!sub?.subscription ? (
          <p className="mt-3 rounded-xl bg-canvas px-4 py-3 text-sm text-ink-soft">
            You are not subscribed yet. Contact your {' '}
            <span className="font-medium text-ink">Linda</span> account manager to activate
            managed collections for your company.
          </p>
        ) : null}
      </Card>

      <Card>
        <CardHeader
          title="Hand a customer to the call centre"
          subtitle="Ask our collectors to follow up this account now, instead of waiting for the nightly overdue sweep"
          action={
            handedOver.length > 0 ? (
              <Pill tone="brand">{handedOver.length} handed over</Pill>
            ) : undefined
          }
        />

        {!isActive ? (
          <div className="p-5">
            <EmptyState
              title="Subscription required"
              hint="Handing accounts to the call centre needs an active managed collections subscription."
            />
          </div>
        ) : (
          <form
            className="grid gap-3 p-5 md:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_auto]"
            onSubmit={(e) => {
              e.preventDefault();
              refer.mutate();
            }}
          >
            <Field label="Customer / loan">
              <Select
                value={loanId}
                onChange={(e) => setLoanId(e.target.value)}
                required
                disabled={pending.length === 0}
              >
                <option value="">
                  {pending.length === 0
                    ? 'Every active loan is already with the call centre'
                    : 'Select a customer…'}
                </option>
                {pending.map((l) => (
                  <option key={l.loanId} value={l.loanId}>
                    {l.customerName} · {l.deviceModel ?? l.deviceImei}
                    {l.isOverdue ? ` · ${l.daysOverdue}d overdue` : ' · not yet due'}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Why now? (optional)">
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Broke a promise, travelling next week…"
                maxLength={280}
              />
            </Field>
            <div className="flex items-end">
              <Button
                type="submit"
                disabled={refer.isPending || !loanId}
                className="w-full"
              >
                <Send className="h-4 w-4" />
                {refer.isPending ? 'Sending…' : 'Hand over'}
              </Button>
            </div>

            {refer.isError ? (
              <p className="text-sm text-rose-600 md:col-span-3">
                Could not hand this account over. Check the loan is still active and your
                subscription has not lapsed.
              </p>
            ) : null}
            {refer.isSuccess ? (
              <p className="text-sm text-emerald-700 md:col-span-3">
                Handed over. It is now in the platform work queue for assignment.
              </p>
            ) : null}
          </form>
        )}

        {handedOver.length > 0 ? (
          <div className="divide-y divide-line border-t border-line px-2 pb-2">
            {handedOver.map((l) => (
              <div
                key={l.loanId}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-3 text-sm"
              >
                <div>
                  <p className="font-medium text-ink">{l.customerName}</p>
                  <p className="text-xs text-muted">
                    {l.deviceModel ?? l.deviceImei}
                    {l.referredAt ? ` · handed over ${shortDate(l.referredAt)}` : ''}
                  </p>
                </div>
                {l.caseStatus ? <StatusPill status={l.caseStatus} /> : null}
              </div>
            ))}
          </div>
        ) : null}
      </Card>

      <Card>
        <CardHeader
          title="Collections packages"
          subtitle="Priced by the number of active financed devices"
        />
        <div className="grid gap-3 p-5 sm:grid-cols-3">
          {(packages.data ?? []).map((p) => (
            <div
              key={p.code}
              className="rounded-xl border border-line bg-canvas/60 p-4 text-sm"
            >
              <p className="font-semibold text-ink">{p.label}</p>
              <p className="mt-1 text-muted">
                Devices {p.deviceBandMin}–{p.deviceBandMax}
              </p>
              <p className="mt-2 font-semibold tabular-nums">
                {p.priceModel === 'PER_DEVICE'
                  ? `${money(p.unitPrice ?? 0)} / device / mo`
                  : `${money(p.flatPrice ?? 0)} / mo`}
              </p>
            </div>
          ))}
        </div>
      </Card>

      {activity.data ? (
        <Card>
          <CardHeader
            title="Collector activity (last 7 days)"
            subtitle="What platform collectors did on your overdue accounts"
          />
          <div className="grid gap-3 p-5 sm:grid-cols-3">
            <div className="rounded-xl bg-canvas p-4 text-sm">
              <p className="text-muted">Contacts</p>
              <p className="text-2xl font-bold tabular-nums">
                {activity.data.totals.contacts}
              </p>
            </div>
            <div className="rounded-xl bg-canvas p-4 text-sm">
              <p className="text-muted">Promises logged</p>
              <p className="text-2xl font-bold tabular-nums">
                {activity.data.totals.promises}
              </p>
            </div>
            <div className="rounded-xl bg-canvas p-4 text-sm">
              <p className="text-muted">Collectors active</p>
              <p className="text-2xl font-bold tabular-nums">
                {activity.data.totals.collectorsActive}
              </p>
            </div>
          </div>

          {(activity.data.byCollector?.length ?? 0) > 0 ? (
            <div className="space-y-2 border-t border-line px-5 py-4">
              {activity.data.byCollector.map((c) => (
                <div
                  key={c.collectorName}
                  className="flex justify-between rounded-xl bg-canvas px-4 py-2 text-sm"
                >
                  <span className="font-medium">{c.collectorName}</span>
                  <span className="text-muted">
                    {c.contacts} contacts · {c.calls} call · {c.sms} sms · {c.wa} wa
                  </span>
                </div>
              ))}
            </div>
          ) : null}

          {(activity.data.recentContacts?.length ?? 0) > 0 ? (
            <div className="max-h-64 space-y-2 overflow-y-auto border-t border-line p-5">
              {activity.data.recentContacts.map((c) => (
                <div
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-2 text-sm"
                >
                  <div>
                    <p className="font-medium text-ink">{c.customerName}</p>
                    <p className="text-xs text-muted">
                      {c.collectorName} · {c.channel} · {shortDate(c.initiatedAt)}
                    </p>
                  </div>
                  <StatusPill status={c.verificationStatus} />
                </div>
              ))}
            </div>
          ) : (
            <div className="border-t border-line p-5">
              <EmptyState title="No collector contacts this week yet" />
            </div>
          )}
        </Card>
      ) : null}

      <CaseList
        title="Your collection cases"
        subtitle="Overdue accounts in managed collections (read-only)"
        rows={cases.data}
        loading={cases.isLoading}
        empty="No managed cases for your company yet."
        showCompany={false}
      />

      <Card>
        <CardHeader
          title="Collections invoices"
          subtitle="Managed follow-up packages, separate from your platform billing"
        />
        {!invoices.data?.length ? (
          <div className="p-5">
            <EmptyState
              title="No collections invoices yet"
              hint="Invoices appear here once your subscription is active."
            />
          </div>
        ) : (
          <div className="divide-y divide-line px-2 pb-2">
            {invoices.data.map((inv) => (
              <div
                key={inv.id}
                className="flex flex-wrap items-center justify-between gap-3 px-3 py-3 text-sm"
              >
                <div>
                  <p className="font-semibold">{inv.packageCode}</p>
                  <p className="text-xs text-muted">
                    {shortDate(inv.periodStart)} – {shortDate(inv.periodEnd)} ·{' '}
                    {inv.activeDevices} devices · due {shortDate(inv.dueDate)}
                    {inv.paidAt ? ` · paid ${shortDate(inv.paidAt)}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="font-semibold tabular-nums">{money(inv.total)}</p>
                  <StatusPill status={inv.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
