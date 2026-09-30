import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarCheck,
  FolderOpen,
  Headphones,
  PhoneCall,
  Send,
  Wallet,
} from 'lucide-react';
import { api } from '@/shared/api/client';
import { Card, CardHeader } from '@/shared/components/ui/Card';
import { Pill, StatusPill } from '@/shared/components/ui/Pill';
import { Center, EmptyState, Spinner } from '@/shared/components/ui/misc';
import { Button } from '@/shared/components/ui/Button';
import { Field, Input, Select } from '@/shared/components/ui/Field';
import { StatCard } from '@/shared/components/StatCard';
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

const OPEN_CASE = new Set(['OPEN', 'IN_PROGRESS', 'PROMISED', 'ESCALATED']);

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
  const openCases = (cases.data ?? []).filter((c) => OPEN_CASE.has(c.status));
  const amountUnderCollection = openCases.reduce((sum, c) => sum + Number(c.amountDue), 0);

  return (
    <div className="space-y-6">
      <Card className="p-5 sm:p-6">
        <div className="flex items-center gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
            <Headphones className="h-5 w-5" />
          </div>
          <div>
            {sub?.subscription ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-lg font-bold tracking-tight">
                  {titleCase(sub.subscription.packageCode)} plan
                </span>
                <StatusPill status={sub.subscription.status} />
              </div>
            ) : (
              <p className="text-lg font-bold tracking-tight">Not subscribed</p>
            )}
            <p className="mt-0.5 text-sm text-muted">
              {sub?.activeDevices ?? '—'} active devices
              {sub?.suggestedPackage
                ? ` · Suggested package: ${titleCase(sub.suggestedPackage)}`
                : ''}
            </p>
          </div>
        </div>
        {!sub?.subscription && !mySub.isLoading ? (
          <p className="mt-4 border-t border-line pt-4 text-sm text-ink-soft">
            Managed collections is not active yet. Contact your{' '}
            <span className="font-medium text-ink">Linda</span> account manager to
            activate follow-up for your company.
          </p>
        ) : null}
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={FolderOpen}
          label="Open cases"
          value={cases.isLoading ? '—' : openCases.length.toLocaleString()}
          hint="in managed follow-up"
          tone="red"
        />
        <StatCard
          icon={Wallet}
          label="Under collection"
          value={cases.isLoading ? '—' : money(amountUnderCollection)}
          hint="open case balances"
          tone="amber"
        />
        <StatCard
          icon={PhoneCall}
          label="Contacts this week"
          value={
            activity.isLoading || !activity.data
              ? '—'
              : activity.data.totals.contacts.toLocaleString()
          }
          hint={
            activity.data
              ? `${activity.data.totals.collectorsActive} collector${activity.data.totals.collectorsActive === 1 ? '' : 's'} active`
              : undefined
          }
          tone="brand"
        />
        <StatCard
          icon={CalendarCheck}
          label="Promises logged"
          value={
            activity.isLoading || !activity.data
              ? '—'
              : activity.data.totals.promises.toLocaleString()
          }
          hint="last 7 days"
          tone="green"
        />
      </div>

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
          title="Collector activity"
          subtitle="What platform collectors did on your overdue accounts in the last 7 days"
        />
        {activity.isLoading ? (
          <Center><Spinner /></Center>
        ) : !activity.data ? (
          <div className="p-5">
            <EmptyState title="No activity data" />
          </div>
        ) : (
          <>
            {(activity.data.byCollector?.length ?? 0) > 0 ? (
              <div className="px-2 pb-2 pt-2">
                <p className="px-3 pb-1 text-xs font-medium text-muted">By collector</p>
                <div className="divide-y divide-line">
                  {activity.data.byCollector.map((c) => (
                    <div
                      key={c.collectorName}
                      className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2.5 text-sm"
                    >
                      <span className="font-medium">{c.collectorName}</span>
                      <span className="tabular-nums text-muted">
                        {plural(c.contacts, 'contact')} · {plural(c.calls, 'call')} ·{' '}
                        {c.sms.toLocaleString()} SMS · {plural(c.wa, 'WhatsApp message')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="border-t border-line px-2 pb-3 pt-3">
              <p className="px-3 pb-1 text-xs font-medium text-muted">Latest contacts</p>
              {(activity.data.recentContacts?.length ?? 0) > 0 ? (
                <div className="max-h-64 divide-y divide-line overflow-y-auto">
                  {activity.data.recentContacts.map((c) => (
                    <div
                      key={c.id}
                      className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm"
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
                <div className="px-3 py-4">
                  <EmptyState title="No collector contacts this week yet" />
                </div>
              )}
            </div>
          </>
        )}
      </Card>

      <CaseList
        title="Your collection cases"
        subtitle="Overdue accounts in managed collections (read-only)"
        rows={cases.data}
        loading={cases.isLoading}
        empty="No managed cases for your company yet."
        showCompany={false}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Collections packages"
            subtitle="Priced by the number of active financed devices"
          />
          {packages.isLoading ? (
            <Center><Spinner /></Center>
          ) : (
            <div className="divide-y divide-line px-2 pb-2 pt-2">
              {(packages.data ?? []).map((p) => {
                const current = sub?.subscription?.packageCode === p.code;
                return (
                  <div
                    key={p.code}
                    className="flex items-center justify-between gap-3 px-3 py-3 text-sm"
                  >
                    <div>
                      <p className="flex flex-wrap items-center gap-2 font-medium">
                        {p.label}
                        {current ? <Pill tone="brand">Current</Pill> : null}
                      </p>
                      <p className="mt-0.5 text-xs text-muted">
                        Devices {p.deviceBandMin}–{p.deviceBandMax}
                      </p>
                    </div>
                    <p className="shrink-0 font-semibold tabular-nums">
                      {p.priceModel === 'PER_DEVICE'
                        ? `${money(p.unitPrice ?? 0)} / device / mo`
                        : `${money(p.flatPrice ?? 0)} / mo`}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Collections invoices"
            subtitle="Managed follow-up packages, separate from platform billing"
          />
          {invoices.isLoading ? (
            <Center><Spinner /></Center>
          ) : !invoices.data?.length ? (
            <div className="p-5">
              <EmptyState
                title="No collections invoices yet"
                hint="Invoices appear here once your subscription is active."
              />
            </div>
          ) : (
            <div className="divide-y divide-line px-2 pb-2 pt-2">
              {invoices.data.map((inv) => (
                <div key={inv.id} className="px-3 py-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">{titleCase(inv.packageCode)}</p>
                    <p className="font-semibold tabular-nums">{money(inv.total)}</p>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-muted">
                      {shortDate(inv.periodStart)} – {shortDate(inv.periodEnd)} ·{' '}
                      {inv.activeDevices} devices · due {shortDate(inv.dueDate)}
                      {inv.paidAt ? ` · paid ${shortDate(inv.paidAt)}` : ''}
                    </p>
                    <StatusPill status={inv.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function plural(count: number, one: string, many = `${one}s`) {
  return `${count.toLocaleString()} ${count === 1 ? one : many}`;
}

function titleCase(value: string) {
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
