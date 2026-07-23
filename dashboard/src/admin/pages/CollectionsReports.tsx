import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, BarChart3, Clock } from 'lucide-react';
import { api } from '@/shared/api/client';
import { useAuth } from '@/shared/auth/AuthContext';
import { Card, CardHeader } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { StatusPill } from '@/shared/components/ui/Pill';
import { Center, EmptyState, Spinner } from '@/shared/components/ui/misc';
import { Field, Input, Select } from '@/shared/components/ui/Field';
import { money, shortDate } from '@/shared/lib/format';
import { tokenStore } from '@/shared/api/client';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/v1';

function downloadCsv(path: string, params: Record<string, string>) {
  const token = tokenStore.access;
  const qs = new URLSearchParams(params).toString();
  const url = `${API_BASE}${path}${qs ? `?${qs}` : ''}`;
  return fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  }).then(async (res) => {
    if (!res.ok) throw new Error('Download failed');
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = path.includes('paid')
      ? 'paid-cases.csv'
      : 'collector-performance.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  });
}

type PaidRow = {
  paymentId: string;
  amount: string | number;
  method: string;
  receivedAt: string;
  companyName: string;
  customerName: string;
  customerPhone: string;
  deviceImei: string | null;
  caseId: string | null;
  collectorName: string | null;
};

type Stats = {
  period: { from: string; to: string };
  summary: {
    openCases: number;
    overdueBook: number;
    collectedInPeriod: number;
    recoveryRate: number | null;
    ptpDueInPeriod: number;
    ptpKept: number;
    ptpKeepRate: number | null;
    contactSessions: number;
    verifiedOrAttemptedContacts: number;
    selfReportedContacts: number;
    avgCallSeconds: number | null;
    totalTalkSeconds: number;
  };
  byCompany: Array<{
    tenantId: string;
    companyName: string;
    overdueBook: number;
    openCases: number;
    collected: number;
  }>;
  byCollector: Array<{
    collectorId: string;
    collectorName: string;
    contacts: number;
    verified: number;
    talkSeconds: number;
    avgCallSeconds: number;
  }>;
};

type PromiseRow = {
  id: string;
  promisedAmount: string | number;
  dueDate: string;
  status: string;
  notes?: string | null;
  tenant: { name: string };
  case: { id: string; daysOverdue: number };
  createdBy?: { fullName: string } | null;
};

function monthStartIso() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

type PerfRow = {
  collectorId: string;
  collectorName: string;
  followUpsCount: number;
  callsCount: number;
  smsCount: number;
  whatsappCount: number;
  talkSeconds: number;
  hoursWorked: number;
  avgCallSeconds: number | null;
  ptpCount: number;
  daysActive: number;
};

type PerfResponse = {
  period: { kind: string; from: string; to: string };
  byCollector: PerfRow[];
  series: Array<{
    bucket: string;
    followUpsCount: number;
    callsCount: number;
    hoursWorked: number;
    avgCallSeconds: number | null;
  }>;
  totals: {
    followUpsCount: number;
    callsCount: number;
    talkSeconds: number;
    hoursWorkedSeconds: number;
    ptpCount: number;
  };
};

type WorkMe = {
  open: { id: string; startedAt: string } | null;
  todayWorkedSeconds: number;
};

function formatHours(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}h ${m}m`;
}

export default function CollectionsReports() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [from, setFrom] = useState(monthStartIso());
  const [to, setTo] = useState(todayIso());
  const [ptpStatus, setPtpStatus] = useState('');
  const [perfPeriod, setPerfPeriod] = useState<'day' | 'month' | 'year'>('month');

  const range = { from: new Date(from).toISOString(), to: new Date(to + 'T23:59:59').toISOString() };
  const isCollector =
    user?.role === 'COLLECTOR' ||
    user?.role === 'COLLECTIONS_ADMIN' ||
    user?.role === 'SUPER_ADMIN';

  const stats = useQuery({
    queryKey: ['collections', 'reports', 'stats', from, to],
    queryFn: async () =>
      (await api.get<Stats>('/collections/reports/payment-stats', { params: range })).data,
  });

  const paid = useQuery({
    queryKey: ['collections', 'reports', 'paid', from, to],
    queryFn: async () =>
      (await api.get<PaidRow[]>('/collections/reports/paid-cases', { params: range })).data,
    enabled: user?.role !== 'COLLECTOR',
  });

  const promises = useQuery({
    queryKey: ['collections', 'promises', ptpStatus],
    queryFn: async () =>
      (
        await api.get<PromiseRow[]>('/collections/promises', {
          params: ptpStatus ? { status: ptpStatus } : {},
        })
      ).data,
  });

  const work = useQuery({
    queryKey: ['collections', 'work-sessions', 'me'],
    queryFn: async () =>
      (await api.get<WorkMe>('/collections/work-sessions/me')).data,
    enabled: Boolean(isCollector),
    refetchInterval: 60_000,
  });

  const perf = useQuery({
    queryKey: ['collections', 'reports', 'collector-performance', perfPeriod],
    queryFn: async () =>
      (
        await api.get<PerfResponse>('/collections/reports/collector-performance', {
          params: { period: perfPeriod },
        })
      ).data,
    enabled: Boolean(isCollector),
  });

  const clockIn = useMutation({
    mutationFn: async () => (await api.post('/collections/work-sessions/clock-in')).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['collections', 'work-sessions'] }),
  });
  const clockOut = useMutation({
    mutationFn: async () => (await api.post('/collections/work-sessions/clock-out')).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['collections', 'work-sessions'] });
      qc.invalidateQueries({ queryKey: ['collections', 'reports', 'collector-performance'] });
    },
  });
  const rollDaily = useMutation({
    mutationFn: async () => (await api.post('/collections/reports/roll-daily')).data,
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['collections', 'reports', 'collector-performance'] }),
  });

  const s = stats.data?.summary;

  return (
    <div className="space-y-6">
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" /> Back to work queue
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-brand-600" />
          <div>
            <h2 className="text-lg font-bold">Collections reports</h2>
            <p className="text-sm text-muted">
              Paid cases, payment progress, promises — always with company context
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <Field label="From">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="To">
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
        </div>
      </div>

      {isCollector ? (
        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-brand-600" />
              <div>
                <p className="font-semibold">Work session</p>
                <p className="text-sm text-muted">
                  Hours worked use clock-in/out (talk time is separate)
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm tabular-nums text-muted">
                Today: {formatHours(work.data?.todayWorkedSeconds ?? 0)}
                {work.data?.open
                  ? ` · clocked in since ${shortDate(work.data.open.startedAt)}`
                  : ' · not clocked in'}
              </span>
              {work.data?.open ? (
                <Button
                  variant="secondary"
                  onClick={() => clockOut.mutate()}
                  disabled={clockOut.isPending}
                >
                  Clock out
                </Button>
              ) : (
                <Button onClick={() => clockIn.mutate()} disabled={clockIn.isPending}>
                  Clock in
                </Button>
              )}
              {user?.role === 'SUPER_ADMIN' || user?.role === 'COLLECTIONS_ADMIN' ? (
                <Button
                  variant="ghost"
                  onClick={() => rollDaily.mutate()}
                  disabled={rollDaily.isPending}
                >
                  Refresh daily stats
                </Button>
              ) : null}
            </div>
          </div>
        </Card>
      ) : null}

      {isCollector && perf.data ? (
        <Card>
          <CardHeader
            title="Collector performance"
            subtitle="Daily / monthly / annual history (hours + calls + follow-ups)"
            action={
              <div className="flex flex-wrap gap-2">
                <Select
                  className="w-36"
                  value={perfPeriod}
                  onChange={(e) =>
                    setPerfPeriod(e.target.value as 'day' | 'month' | 'year')
                  }
                >
                  <option value="day">Today</option>
                  <option value="month">This month</option>
                  <option value="year">This year</option>
                </Select>
                <Button
                  variant="secondary"
                  onClick={() =>
                    downloadCsv('/collections/reports/collector-performance.csv', {
                      period: perfPeriod,
                    }).catch(() => alert('CSV download failed'))
                  }
                >
                  Export CSV
                </Button>
              </div>
            }
          />
          <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-5">
            <Stat
              label="Hours worked"
              value={String(
                Number((perf.data.totals.hoursWorkedSeconds / 3600).toFixed(2)),
              )}
            />
            <Stat label="Follow-ups" value={String(perf.data.totals.followUpsCount)} />
            <Stat label="Calls" value={String(perf.data.totals.callsCount)} />
            <Stat
              label="Talk hours"
              value={String(Number((perf.data.totals.talkSeconds / 3600).toFixed(2)))}
            />
            <Stat label="PTPs logged" value={String(perf.data.totals.ptpCount)} />
          </div>
          <div className="overflow-x-auto px-2 pb-3">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-3 py-2 font-medium">Collector</th>
                  <th className="px-3 py-2 font-medium">Hours</th>
                  <th className="px-3 py-2 font-medium">Follow-ups</th>
                  <th className="px-3 py-2 font-medium">Calls</th>
                  <th className="px-3 py-2 font-medium">Avg call</th>
                  <th className="px-3 py-2 font-medium">SMS</th>
                  <th className="px-3 py-2 font-medium">WhatsApp</th>
                  <th className="px-3 py-2 font-medium">PTP</th>
                </tr>
              </thead>
              <tbody>
                {perf.data.byCollector.map((r) => (
                  <tr key={r.collectorId} className="border-t border-line">
                    <td className="px-3 py-3 font-medium">{r.collectorName}</td>
                    <td className="px-3 py-3 tabular-nums">{r.hoursWorked}</td>
                    <td className="px-3 py-3 tabular-nums">{r.followUpsCount}</td>
                    <td className="px-3 py-3 tabular-nums">{r.callsCount}</td>
                    <td className="px-3 py-3 tabular-nums">
                      {r.avgCallSeconds != null ? `${r.avgCallSeconds}s` : '—'}
                    </td>
                    <td className="px-3 py-3 tabular-nums">{r.smsCount}</td>
                    <td className="px-3 py-3 tabular-nums">{r.whatsappCount}</td>
                    <td className="px-3 py-3 tabular-nums">{r.ptpCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(perf.data.series?.length ?? 0) > 0 ? (
            <div className="border-t border-line p-5">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                Trend ({perfPeriod})
              </p>
              <div className="flex flex-wrap gap-2">
                {perf.data.series.map((b) => (
                  <div
                    key={b.bucket}
                    className="rounded-xl bg-canvas px-3 py-2 text-xs"
                  >
                    <p className="font-semibold">{b.bucket}</p>
                    <p className="text-muted">
                      {b.followUpsCount} FU · {b.hoursWorked}h ·{' '}
                      {b.avgCallSeconds != null ? `${b.avgCallSeconds}s avg` : '—'}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </Card>
      ) : null}

      {stats.isLoading ? (
        <Center><Spinner /></Center>
      ) : s ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Open cases" value={String(s.openCases)} />
          <Stat label="Overdue book" value={money(s.overdueBook)} />
          <Stat label="Collected (period)" value={money(s.collectedInPeriod)} />
          <Stat
            label="Recovery rate"
            value={
              s.recoveryRate != null
                ? `${(s.recoveryRate * 100).toFixed(1)}%`
                : '—'
            }
          />
          <Stat label="PTP due" value={`${s.ptpKept}/${s.ptpDueInPeriod} kept`} />
          <Stat label="Contacts" value={String(s.contactSessions)} />
          <Stat
            label="Verified / attempted"
            value={String(s.verifiedOrAttemptedContacts)}
          />
          <Stat
            label="Avg call (sec)"
            value={s.avgCallSeconds != null ? String(s.avgCallSeconds) : '—'}
          />
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="By company" subtitle="Overdue book vs collected" />
          <div className="max-h-80 space-y-2 overflow-y-auto p-5">
            {(stats.data?.byCompany ?? []).length === 0 ? (
              <EmptyState title="No company data in range" />
            ) : (
              stats.data!.byCompany.map((r) => (
                <div
                  key={r.tenantId}
                  className="flex items-center justify-between rounded-xl bg-canvas px-4 py-3 text-sm"
                >
                  <div>
                    <p className="font-semibold">{r.companyName}</p>
                    <p className="text-xs text-muted">
                      {r.openCases} open cases · overdue {money(r.overdueBook)}
                    </p>
                  </div>
                  <p className="font-semibold tabular-nums text-emerald-700">
                    {money(r.collected)}
                  </p>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="By collector" subtitle="Contacts in period" />
          <div className="max-h-80 space-y-2 overflow-y-auto p-5">
            {(stats.data?.byCollector ?? []).length === 0 ? (
              <EmptyState title="No collector activity in range" />
            ) : (
              stats.data!.byCollector.map((r) => (
                <div
                  key={r.collectorId}
                  className="flex items-center justify-between rounded-xl bg-canvas px-4 py-3 text-sm"
                >
                  <div>
                    <p className="font-semibold">{r.collectorName}</p>
                    <p className="text-xs text-muted">
                      {r.contacts} contacts · {r.verified} verified/attempted · avg{' '}
                      {r.avgCallSeconds}s
                    </p>
                  </div>
                  <p className="text-xs text-muted tabular-nums">
                    talk {Math.round(r.talkSeconds / 60)}m
                  </p>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      {user?.role !== 'COLLECTOR' ? (
        <Card>
          <CardHeader
            title="Paid cases"
            subtitle="Confirmed payments with company and payment date"
            action={
              <Button
                variant="secondary"
                onClick={() =>
                  downloadCsv('/collections/reports/paid-cases.csv', {
                    from: range.from,
                    to: range.to,
                  }).catch(() => alert('CSV download failed'))
                }
              >
                Export CSV
              </Button>
            }
          />
          {paid.isLoading ? (
            <Center><Spinner /></Center>
          ) : !paid.data?.length ? (
            <div className="p-5">
              <EmptyState title="No confirmed payments in this range" />
            </div>
          ) : (
            <div className="overflow-x-auto px-2 pb-3">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-muted">
                    <th className="px-3 py-2 font-medium">Date</th>
                    <th className="px-3 py-2 font-medium">Company</th>
                    <th className="px-3 py-2 font-medium">Customer</th>
                    <th className="px-3 py-2 font-medium">Method</th>
                    <th className="px-3 py-2 font-medium">Collector</th>
                    <th className="px-3 py-2 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {paid.data.map((r) => (
                    <tr key={r.paymentId} className="border-t border-line">
                      <td className="px-3 py-3 tabular-nums text-muted">
                        {shortDate(r.receivedAt)}
                      </td>
                      <td className="px-3 py-3 font-medium">{r.companyName}</td>
                      <td className="px-3 py-3">
                        {r.caseId ? (
                          <Link
                            to={`/cases/${r.caseId}`}
                            className="text-brand-700 hover:underline"
                          >
                            {r.customerName}
                          </Link>
                        ) : (
                          r.customerName
                        )}
                        <p className="text-xs text-muted">{r.customerPhone}</p>
                      </td>
                      <td className="px-3 py-3 text-muted">{r.method}</td>
                      <td className="px-3 py-3 text-muted">
                        {r.collectorName ?? '—'}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold tabular-nums">
                        {money(r.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title="Promises to pay"
          subtitle="Client payment commitments"
          action={
            <Select
              className="w-40"
              value={ptpStatus}
              onChange={(e) => setPtpStatus(e.target.value)}
            >
              <option value="">All statuses</option>
              <option value="OPEN">OPEN</option>
              <option value="KEPT">KEPT</option>
              <option value="BROKEN">BROKEN</option>
              <option value="CANCELLED">CANCELLED</option>
            </Select>
          }
        />
        {promises.isLoading ? (
          <Center><Spinner /></Center>
        ) : !promises.data?.length ? (
          <div className="p-5">
            <EmptyState title="No promises" />
          </div>
        ) : (
          <div className="divide-y divide-line px-2 pb-2">
            {promises.data.map((p) => (
              <div
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-3 text-sm"
              >
                <div>
                  <p className="font-semibold">
                    {p.tenant.name} · {money(p.promisedAmount)} by{' '}
                    {shortDate(p.dueDate)}
                  </p>
                  <p className="text-xs text-muted">
                    {p.createdBy?.fullName ?? '—'}
                    {p.notes ? ` · ${p.notes}` : ''}
                    {' · '}
                    <Link
                      to={`/cases/${p.case.id}`}
                      className="text-brand-700 hover:underline"
                    >
                      Open case
                    </Link>
                  </p>
                </div>
                <StatusPill status={p.status} />
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-1 text-xl font-bold tracking-tight tabular-nums">{value}</p>
    </Card>
  );
}
