import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Send } from '@/shared/icons';
import { api } from '@/shared/api/client';
import { Card } from '@/shared/components/ui/Card';
import { Pill, StatusDot, StatusPill } from '@/shared/components/ui/Pill';
import { Row, Table } from '@/shared/components/ui/Table';
import { Center, EmptyState, Spinner } from '@/shared/components/ui/misc';
import { Button } from '@/shared/components/ui/Button';
import { Field, Input, Select } from '@/shared/components/ui/Field';
import { FigureStrip } from '@/shared/components/FigureStrip';
import { PanelEmpty, PanelHeader } from '@/shared/components/Panel';
import { Tabs } from '@/shared/components/Tabs';
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

type TabId = 'cases' | 'handover' | 'activity' | 'billing';
const TAB_IDS: TabId[] = ['cases', 'handover', 'activity', 'billing'];

/**
 * Seller-facing view of the managed collections service. Read-only by design:
 * platform collectors do the follow-up, the seller sees what they are paying
 * for and what it produced. Working a queue happens in the admin console only.
 */
export default function CollectionsService() {
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const tab: TabId = TAB_IDS.includes(params.get('tab') as TabId) ? (params.get('tab') as TabId) : 'cases';
  const setTab = (t: TabId) => setParams(t === 'cases' ? {} : { tab: t }, { replace: true });
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
    queryFn: async () => (await api.get<ReferableLoan[]>('/collections/cases/referable')).data,
  });

  const refer = useMutation({
    mutationFn: async () =>
      (await api.post('/collections/cases/refer', { loanId, note: note || undefined })).data,
    onSuccess: () => {
      setLoanId('');
      setNote('');
      qc.invalidateQueries({ queryKey: ['collections'] });
    },
  });

  const sub = mySub.data;
  const isActive = sub?.subscription?.status === 'ACTIVE';
  const all = referable.data ?? [];
  const sent = all.filter((l) => !!l.caseId);
  const waiting = all.filter((l) => !l.caseId);
  // Phones already with the call centre but resting (nothing overdue) can still be moved up early.
  const early = all.filter((l) => !l.caseId || l.caseStatus === 'MONITORING');
  const openCases = (cases.data ?? []).filter((c) => OPEN_CASE.has(c.status));
  const amountUnderCollection = openCases.reduce((sum, c) => sum + Number(c.amountDue), 0);
  const a = activity.data;
  const dash = '—';

  return (
    <div className="space-y-5">
      <Card className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-4">
        <div className="min-w-0">
          {sub?.subscription ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[15px] font-semibold tracking-tight text-ink">
                {titleCase(sub.subscription.packageCode)} plan
              </span>
              <StatusDot status={sub.subscription.status} />
            </div>
          ) : (
            <p className="text-[15px] font-semibold tracking-tight text-ink">Not subscribed</p>
          )}
          <p className="mt-0.5 text-xs text-muted">
            {sub?.activeDevices ?? dash} active devices
            {sub?.suggestedPackage ? ` · Suggested package: ${titleCase(sub.suggestedPackage)}` : ''}
          </p>
        </div>
        {!sub?.subscription && !mySub.isLoading ? (
          <p className="max-w-md text-xs text-muted">
            Managed collections is not active yet. Contact your{' '}
            <span className="font-medium text-ink">Linda</span> account manager to activate
            follow-up for your company.
          </p>
        ) : null}
      </Card>

      <FigureStrip
        items={[
          { label: 'Open cases', value: cases.isLoading ? dash : openCases.length.toLocaleString(), hint: 'in managed follow-up' },
          { label: 'Under collection', value: cases.isLoading ? dash : money(amountUnderCollection), hint: 'open case balances' },
          {
            label: 'Contacts this week',
            value: a ? a.totals.contacts.toLocaleString() : dash,
            hint: a ? `${a.totals.collectorsActive} collector${a.totals.collectorsActive === 1 ? '' : 's'} active` : undefined,
          },
          { label: 'Promises logged', value: a ? a.totals.promises.toLocaleString() : dash, hint: 'last 7 days' },
        ]}
      />

      <Tabs
        label="Collections sections"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'cases', label: 'Cases', count: openCases.length },
          { id: 'handover', label: 'Call centre', count: sent.length },
          { id: 'activity', label: 'Collector activity' },
          { id: 'billing', label: 'Plan & invoices' },
        ]}
      />

      {tab === 'cases' ? (
        <CaseList
          title="Your collection cases"
          subtitle="Overdue accounts in managed collections (read-only)"
          rows={cases.data}
          loading={cases.isLoading}
          empty="No managed cases for your company yet."
          showCompany={false}
        />
      ) : null}

      {tab === 'handover' ? (
        <>
          <Card>
            <PanelHeader
              title="Phones with the call centre"
              sub="Every enrolled phone is sent to the call centre automatically. There is nothing to hand over."
              right={sent.length > 0 ? <Pill tone="brand">{sent.length} with the call centre</Pill> : undefined}
            />
            {!isActive ? (
              <div className="p-5">
                <EmptyState
                  title="Subscription required"
                  hint="The call centre follows up your phones once you have an active managed collections subscription. Enrolled phones are then sent to it automatically."
                />
              </div>
            ) : (
              <p className="px-5 pb-4 text-sm text-muted">
                A phone is sent the moment it is enrolled. Collectors start calling only when a payment is overdue, and
                can lock or unlock the phone on your behalf.
                {waiting.length > 0
                  ? ` ${waiting.length} loan${waiting.length === 1 ? ' is' : 's are'} not sent yet because the phone has not been enrolled.`
                  : ''}
              </p>
            )}
          </Card>

          {isActive && early.length > 0 ? (
            <Card>
              <PanelHeader
                title="Ask for follow-up now (optional)"
                sub="Use this to move one customer to the front of the queue before a payment is overdue"
              />
              <form
                className="grid gap-3 p-5 md:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_auto]"
                onSubmit={(e) => {
                  e.preventDefault();
                  refer.mutate();
                }}
              >
                <Field label="Customer / loan">
                  <Select value={loanId} onChange={(e) => setLoanId(e.target.value)} required>
                    <option value="">Select a customer…</option>
                    {early.map((l) => (
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
                  <Button type="submit" disabled={refer.isPending || !loanId} className="w-full">
                    <Send className="h-4 w-4" />
                    {refer.isPending ? 'Sending…' : 'Ask for follow-up'}
                  </Button>
                </div>
                {refer.isError ? (
                  <p className="text-sm text-rose-600 md:col-span-3">
                    Could not send this request. Check the loan is still active and your subscription has not lapsed.
                  </p>
                ) : null}
                {refer.isSuccess ? (
                  <p className="text-sm text-emerald-700 md:col-span-3">
                    Done. It is now in the platform work queue for assignment.
                  </p>
                ) : null}
              </form>
            </Card>
          ) : null}

          {sent.length > 0 ? (
            <Card>
              <PanelHeader title="With the call centre" sub={`${sent.length} account${sent.length === 1 ? '' : 's'}`} />
              <Table columns={['Customer', 'Phone', 'Sent', 'Status']}>
                {sent.map((l) => (
                  <Row key={l.loanId}>
                    <td className="px-4 py-3 font-medium text-ink">{l.customerName}</td>
                    <td className="px-4 py-3 text-muted">{l.deviceModel ?? l.deviceImei ?? dash}</td>
                    <td className="px-4 py-3 text-muted">
                      {l.caseSource === 'SELLER_HANDOFF'
                        ? `By you${l.referredAt ? ` · ${shortDate(l.referredAt)}` : ''}`
                        : 'Automatically'}
                    </td>
                    <td className="px-4 py-3 text-right">{l.caseStatus ? <StatusDot status={l.caseStatus} /> : dash}</td>
                  </Row>
                ))}
              </Table>
            </Card>
          ) : null}
        </>
      ) : null}

      {tab === 'activity' ? (
        activity.isLoading ? (
          <Center><Spinner /></Center>
        ) : !a ? (
          <Card><PanelEmpty>No activity data.</PanelEmpty></Card>
        ) : (
          <>
            {(a.byCollector?.length ?? 0) > 0 ? (
              <Card>
                <PanelHeader title="By collector" sub="Last 7 days" />
                <Table columns={['Collector', 'Contacts', 'Calls', 'SMS', 'WhatsApp']}>
                  {a.byCollector.map((c) => (
                    <Row key={c.collectorName}>
                      <td className="px-4 py-3 font-medium text-ink">{c.collectorName}</td>
                      <td className="px-4 py-3 tabular-nums text-muted">{c.contacts.toLocaleString()}</td>
                      <td className="px-4 py-3 tabular-nums text-muted">{c.calls.toLocaleString()}</td>
                      <td className="px-4 py-3 tabular-nums text-muted">{c.sms.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted">{c.wa.toLocaleString()}</td>
                    </Row>
                  ))}
                </Table>
              </Card>
            ) : null}
            <Card>
              <PanelHeader title="Latest contacts" sub="What collectors did on your overdue accounts" />
              {(a.recentContacts?.length ?? 0) > 0 ? (
                <Table columns={['Customer', 'Collector', 'Channel', 'Date', 'Verification']}>
                  {a.recentContacts.map((c) => (
                    <Row key={c.id}>
                      <td className="px-4 py-3 font-medium text-ink">{c.customerName}</td>
                      <td className="px-4 py-3 text-muted">{c.collectorName}</td>
                      <td className="px-4 py-3 text-muted">{titleCase(c.channel)}</td>
                      <td className="px-4 py-3 text-muted">{shortDate(c.initiatedAt)}</td>
                      <td className="px-4 py-3 text-right"><StatusDot status={c.verificationStatus} /></td>
                    </Row>
                  ))}
                </Table>
              ) : (
                <PanelEmpty>No collector contacts this week yet.</PanelEmpty>
              )}
            </Card>
          </>
        )
      ) : null}

      {tab === 'billing' ? (
        <>
          <Card>
            <PanelHeader title="Collections packages" sub="Priced by the number of active financed devices" />
            {packages.isLoading ? (
              <Center><Spinner /></Center>
            ) : (
              <Table columns={['Package', 'Devices', 'Price']} paginate={false}>
                {(packages.data ?? []).map((p) => (
                  <Row key={p.code}>
                    <td className="px-4 py-3 font-medium text-ink">
                      <span className="flex flex-wrap items-center gap-2">
                        {p.label}
                        {sub?.subscription?.packageCode === p.code ? <Pill tone="brand">Current</Pill> : null}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted">{p.deviceBandMin}–{p.deviceBandMax}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-ink">
                      {p.priceModel === 'PER_DEVICE'
                        ? `${money(p.unitPrice ?? 0)} / device / mo`
                        : `${money(p.flatPrice ?? 0)} / mo`}
                    </td>
                  </Row>
                ))}
              </Table>
            )}
          </Card>

          <Card>
            <PanelHeader title="Collections invoices" sub="Managed follow-up packages, separate from platform billing" />
            {invoices.isLoading ? (
              <Center><Spinner /></Center>
            ) : !invoices.data?.length ? (
              <PanelEmpty>No collections invoices yet. They appear here once your subscription is active.</PanelEmpty>
            ) : (
              <Table columns={['Package', 'Period', 'Devices', 'Due', 'Status', 'Total']}>
                {invoices.data.map((inv) => (
                  <Row key={inv.id}>
                    <td className="px-4 py-3 font-medium text-ink">{titleCase(inv.packageCode)}</td>
                    <td className="px-4 py-3 text-muted">{shortDate(inv.periodStart)} – {shortDate(inv.periodEnd)}</td>
                    <td className="px-4 py-3 tabular-nums text-muted">{inv.activeDevices}</td>
                    <td className="px-4 py-3 text-muted">
                      {shortDate(inv.dueDate)}
                      {inv.paidAt ? <span className="block text-xs text-faint">paid {shortDate(inv.paidAt)}</span> : null}
                    </td>
                    <td className="px-4 py-3"><StatusDot status={inv.status} /></td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-ink">{money(inv.total)}</td>
                  </Row>
                ))}
              </Table>
            )}
          </Card>
        </>
      ) : null}
    </div>
  );
}

function titleCase(value: string) {
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
