import { useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/api/client';
import { useAuth } from '@/shared/auth/AuthContext';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { Card } from '@/shared/components/ui/Card';
import { FigureStrip } from '@/shared/components/FigureStrip';
import { PanelEmpty, PanelHeader, useAccent } from '@/shared/components/Panel';
import { Row, Table } from '@/shared/components/ui/Table';
import { Tabs } from '@/shared/components/Tabs';
import { Button } from '@/shared/components/ui/Button';
import { StatusDot } from '@/shared/components/ui/Pill';
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

/** yyyy-mm-dd in the user's local time (toISOString would shift the day across midnight UTC). */
function localIso(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function monthStartIso() {
  const d = new Date();
  return localIso(new Date(d.getFullYear(), d.getMonth(), 1));
}

function todayIso() {
  return localIso(new Date());
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

type ReportTab = 'overview' | 'collectors' | 'paid' | 'promises';

export default function CollectionsReports() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const accent = useAccent();
  const [params, setParams] = useSearchParams();
  const [from, setFrom] = useState(monthStartIso());
  const [to, setTo] = useState(todayIso());
  const [ptpStatus, setPtpStatus] = useState('');
  const [perfPeriod, setPerfPeriod] = useState<'day' | 'month' | 'year'>('month');
  const [csvError, setCsvError] = useState<string | null>(null);

  const range = { from: new Date(from).toISOString(), to: new Date(to + 'T23:59:59').toISOString() };
  const isCollector =
    user?.role === 'COLLECTOR' ||
    user?.role === 'COLLECTIONS_ADMIN' ||
    user?.role === 'SUPER_ADMIN';
  const canSeePaid = user?.role !== 'COLLECTOR';
  const isAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'COLLECTIONS_ADMIN';

  const tabs: { id: ReportTab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    ...(isCollector ? [{ id: 'collectors' as const, label: 'Collectors' }] : []),
    ...(canSeePaid ? [{ id: 'paid' as const, label: 'Paid cases' }] : []),
    { id: 'promises', label: 'Promises' },
  ];
  const requested = params.get('tab') as ReportTab | null;
  const tab: ReportTab = tabs.some((t) => t.id === requested) ? requested! : 'overview';
  const goTab = (t: ReportTab) => {
    const next = new URLSearchParams(params);
    if (t === 'overview') next.delete('tab');
    else next.set('tab', t);
    setParams(next, { replace: true });
  };

  const stats = useQuery({
    queryKey: ['collections', 'reports', 'stats', from, to],
    queryFn: async () =>
      (await api.get<Stats>('/collections/reports/payment-stats', { params: range })).data,
  });

  const paid = useQuery({
    queryKey: ['collections', 'reports', 'paid', from, to],
    queryFn: async () =>
      (await api.get<PaidRow[]>('/collections/reports/paid-cases', { params: range })).data,
    enabled: canSeePaid,
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

  const exportCsv = (path: string, q: Record<string, string>) => {
    setCsvError(null);
    downloadCsv(path, q).catch(() => setCsvError('The download failed. Try again.'));
  };

  const s = stats.data?.summary;
  const pct = (v: number | null | undefined) => (v != null ? `${(v * 100).toFixed(1)}%` : '—');
  const dateFilters = (
    <div className="flex flex-wrap items-end justify-end gap-3">
      <div className="w-40">
        <Field label="From">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
      </div>
      <div className="w-40">
        <Field label="To">
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <Tabs label="Report sections" tabs={tabs} value={tab} onChange={goTab} />

      {csvError ? <p className="text-sm text-rose-600 dark:text-rose-400">{csvError}</p> : null}

      {tab === 'overview' ? (
        <>
          {dateFilters}
          {stats.isLoading ? (
            <Center><Spinner /></Center>
          ) : s ? (
            <div className="space-y-4">
              <FigureStrip
                items={[
                  { label: 'Open cases', value: s.openCases },
                  { label: 'Overdue book', value: money(s.overdueBook) },
                  { label: 'Collected in period', value: money(s.collectedInPeriod) },
                  { label: 'Recovery rate', value: pct(s.recoveryRate) },
                ]}
              />
              <FigureStrip
                items={[
                  { label: 'Promises kept', value: `${s.ptpKept}/${s.ptpDueInPeriod}`, hint: s.ptpKeepRate != null ? pct(s.ptpKeepRate) : undefined },
                  { label: 'Contacts', value: s.contactSessions },
                  { label: 'Verified / attempted', value: s.verifiedOrAttemptedContacts },
                  { label: 'Avg call', value: s.avgCallSeconds != null ? `${s.avgCallSeconds}s` : '—' },
                ]}
              />
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Card>
              <PanelHeader title="By company" sub="Overdue book against what was collected" />
              {(stats.data?.byCompany ?? []).length === 0 ? (
                <PanelEmpty>No company data in this range.</PanelEmpty>
              ) : (
                <Table columns={['Company', 'Open cases', 'Overdue', 'Collected']}>
                  {stats.data!.byCompany.map((r) => (
                    <Row key={r.tenantId}>
                      <td className="py-3 font-medium text-ink">{r.companyName}</td>
                      <td className="py-3 tabular-nums text-muted">{r.openCases}</td>
                      <td className="py-3 tabular-nums text-muted">{money(r.overdueBook)}</td>
                      <td className="py-3 text-right font-semibold tabular-nums text-ink">{money(r.collected)}</td>
                    </Row>
                  ))}
                </Table>
              )}
            </Card>

            <Card>
              <PanelHeader title="By collector" sub="Contacts in this range" />
              {(stats.data?.byCollector ?? []).length === 0 ? (
                <PanelEmpty>No collector activity in this range.</PanelEmpty>
              ) : (
                <Table columns={['Collector', 'Contacts', 'Verified', 'Avg call', 'Talk time']}>
                  {stats.data!.byCollector.map((r) => (
                    <Row key={r.collectorId}>
                      <td className="py-3 font-medium text-ink">{r.collectorName}</td>
                      <td className="py-3 tabular-nums text-muted">{r.contacts}</td>
                      <td className="py-3 tabular-nums text-muted">{r.verified}</td>
                      <td className="py-3 tabular-nums text-muted">{r.avgCallSeconds}s</td>
                      <td className="py-3 text-right tabular-nums text-muted">{Math.round(r.talkSeconds / 60)} min</td>
                    </Row>
                  ))}
                </Table>
              )}
            </Card>
          </div>
        </>
      ) : null}

      {tab === 'collectors' && isCollector ? (
        <>
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-ink">Work session</h3>
                <p className="mt-0.5 text-xs text-muted">
                  Today {formatHours(work.data?.todayWorkedSeconds ?? 0)}
                  {work.data?.open
                    ? ` · clocked in since ${shortDate(work.data.open.startedAt)}`
                    : ' · not clocked in'}
                  . Hours use clock-in and clock-out; talk time is counted separately.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {isAdmin ? (
                  <Button variant="ghost" onClick={() => rollDaily.mutate()} disabled={rollDaily.isPending}>
                    Refresh daily stats
                  </Button>
                ) : null}
                {work.data?.open ? (
                  <Button variant="secondary" onClick={() => clockOut.mutate()} disabled={clockOut.isPending}>
                    Clock out
                  </Button>
                ) : (
                  <Button onClick={() => clockIn.mutate()} disabled={clockIn.isPending}>
                    Clock in
                  </Button>
                )}
              </div>
            </div>
          </Card>

          <div className="flex flex-wrap items-end justify-end gap-3">
            <div className="w-40">
              <Field label="Period">
                <Select value={perfPeriod} onChange={(e) => setPerfPeriod(e.target.value as 'day' | 'month' | 'year')}>
                  <option value="day">Today</option>
                  <option value="month">This month</option>
                  <option value="year">This year</option>
                </Select>
              </Field>
            </div>
            <Button
              variant="secondary"
              onClick={() => exportCsv('/collections/reports/collector-performance.csv', { period: perfPeriod })}
            >
              Export CSV
            </Button>
          </div>

          {perf.isLoading ? (
            <Center><Spinner /></Center>
          ) : perf.data ? (
            <>
              <FigureStrip
                items={[
                  { label: 'Hours worked', value: Number((perf.data.totals.hoursWorkedSeconds / 3600).toFixed(2)) },
                  { label: 'Follow-ups', value: perf.data.totals.followUpsCount },
                  { label: 'Calls', value: perf.data.totals.callsCount },
                  { label: 'Talk hours', value: Number((perf.data.totals.talkSeconds / 3600).toFixed(2)) },
                  { label: 'Promises logged', value: perf.data.totals.ptpCount },
                ]}
              />

              <Card>
                <PanelHeader title="Performance by collector" sub="Hours, calls and follow-ups" />
                {perf.data.byCollector.length === 0 ? (
                  <PanelEmpty>No collector activity in this period.</PanelEmpty>
                ) : (
                  <Table columns={['Collector', 'Hours', 'Follow-ups', 'Calls', 'Avg call', 'SMS', 'WhatsApp', 'Promises']}>
                    {perf.data.byCollector.map((r) => (
                      <Row key={r.collectorId}>
                        <td className="py-3 font-medium text-ink">{r.collectorName}</td>
                        <td className="py-3 tabular-nums text-muted">{r.hoursWorked}</td>
                        <td className="py-3 tabular-nums text-muted">{r.followUpsCount}</td>
                        <td className="py-3 tabular-nums text-muted">{r.callsCount}</td>
                        <td className="py-3 tabular-nums text-muted">{r.avgCallSeconds != null ? `${r.avgCallSeconds}s` : '—'}</td>
                        <td className="py-3 tabular-nums text-muted">{r.smsCount}</td>
                        <td className="py-3 tabular-nums text-muted">{r.whatsappCount}</td>
                        <td className="py-3 text-right tabular-nums text-muted">{r.ptpCount}</td>
                      </Row>
                    ))}
                  </Table>
                )}
              </Card>

              {(perf.data.series?.length ?? 0) > 0 ? (
                <Card>
                  <PanelHeader title="Follow-ups over time" sub={`Per ${perfPeriod === 'day' ? 'hour' : perfPeriod === 'month' ? 'day' : 'month'}`} />
                  <div className="h-52 px-3 pb-4 pt-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={perf.data.series} barCategoryGap={20}>
                        <XAxis dataKey="bucket" tickLine={false} axisLine={false} tick={{ fill: 'var(--muted)', fontSize: 11 }} />
                        <Tooltip
                          cursor={{ fill: 'var(--hover)' }}
                          formatter={(v: number) => [v, 'Follow-ups']}
                          contentStyle={{
                            borderRadius: 10,
                            border: '1px solid var(--line)',
                            background: 'var(--surface)',
                            color: 'var(--ink)',
                            fontSize: 13,
                          }}
                        />
                        <Bar dataKey="followUpsCount" fill={accent} radius={[6, 6, 0, 0]} maxBarSize={48} isAnimationActive={false} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}

      {tab === 'paid' && canSeePaid ? (
        <>
          {dateFilters}
          <Card>
            <PanelHeader
              title="Paid cases"
              sub="Confirmed payments with company and payment date"
              right={
                <Button
                  variant="secondary"
                  className="shrink-0"
                  onClick={() => exportCsv('/collections/reports/paid-cases.csv', { from: range.from, to: range.to })}
                >
                  Export CSV
                </Button>
              }
            />
            {paid.isLoading ? (
              <Center><Spinner /></Center>
            ) : !paid.data?.length ? (
              <PanelEmpty>No confirmed payments in this range.</PanelEmpty>
            ) : (
              <Table columns={['Date', 'Company', 'Customer', 'Method', 'Collector', 'Amount']}>
                {paid.data.map((r) => (
                  <Row key={r.paymentId}>
                    <td className="py-3 tabular-nums text-muted">{shortDate(r.receivedAt)}</td>
                    <td className="py-3 font-medium text-ink">{r.companyName}</td>
                    <td className="py-3">
                      {r.caseId ? (
                        <Link to={`/cases/${r.caseId}`} className="text-brand-600 hover:underline">
                          {r.customerName}
                        </Link>
                      ) : (
                        <span className="text-ink">{r.customerName}</span>
                      )}
                      <p className="text-[11.5px] text-muted">{r.customerPhone}</p>
                    </td>
                    <td className="py-3 text-muted">{r.method}</td>
                    <td className="py-3 text-muted">{r.collectorName ?? '—'}</td>
                    <td className="py-3 text-right font-semibold tabular-nums text-ink">{money(r.amount)}</td>
                  </Row>
                ))}
              </Table>
            )}
          </Card>
        </>
      ) : null}

      {tab === 'promises' ? (
        <>
          <div className="flex justify-end">
            <div className="w-44">
              <Field label="Status">
                <Select value={ptpStatus} onChange={(e) => setPtpStatus(e.target.value)}>
                  <option value="">All statuses</option>
                  <option value="OPEN">Open</option>
                  <option value="KEPT">Kept</option>
                  <option value="BROKEN">Broken</option>
                  <option value="CANCELLED">Cancelled</option>
                </Select>
              </Field>
            </div>
          </div>
          <Card>
            <PanelHeader title="Promises to pay" sub="Payment commitments from customers" />
            {promises.isLoading ? (
              <Center><Spinner /></Center>
            ) : !promises.data?.length ? (
              <PanelEmpty>No promises.</PanelEmpty>
            ) : (
              <Table columns={['Company', 'Amount', 'Due', 'Recorded by', 'Status', '']}>
                {promises.data.map((p) => (
                  <Row key={p.id}>
                    <td className="py-3 font-medium text-ink">{p.tenant.name}</td>
                    <td className="py-3 tabular-nums text-ink">{money(p.promisedAmount)}</td>
                    <td className="py-3 tabular-nums text-muted">{shortDate(p.dueDate)}</td>
                    <td className="py-3 text-muted">
                      {[p.createdBy?.fullName, p.notes].filter(Boolean).join(' · ') || '—'}
                    </td>
                    <td className="py-3"><StatusDot status={p.status} /></td>
                    <td className="py-3 text-right">
                      <Link to={`/cases/${p.case.id}`} className="text-[13px] font-medium text-brand-600 hover:underline">
                        Open case
                      </Link>
                    </td>
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
