import { type ReactNode, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from 'recharts';
import {
  Headphones,
  Inbox,
  Lock,
  PhoneCall,
  Target,
  UserCheck,
  Wallet,
} from 'lucide-react';
import { api } from '@/shared/api/client';
import { StatCard } from '@/shared/components/StatCard';
import { Card } from '@/shared/components/ui/Card';
import { Table, Row } from '@/shared/components/ui/Table';
import { useTheme } from '@/shared/theme/ThemeContext';
import { StatusPill } from '@/shared/components/ui/Pill';
import { Center, EmptyState, Spinner } from '@/shared/components/ui/misc';
import { money, shortDate } from '@/shared/lib/format';

type HotCase = {
  id: string;
  companyName: string;
  customerName: string | null;
  customerPhone: string | null;
  daysOverdue: number;
  amountDue: number;
  currency: string;
  status: string;
  assignedTo: string | null;
};

type TopCollector = {
  collectorId: string;
  collectorName: string;
  followUpsCount: number;
  callsCount: number;
  smsCount: number;
  whatsappCount: number;
  ptpCount: number;
  hoursWorked: number;
};

type PlatformDashboard = {
  view: 'admin' | 'master' | 'collector';
  kpis: Record<string, number>;
  recentLeads: Array<{
    id: string;
    companyName: string;
    fullName: string;
    phone: string;
    status: string;
    suggestedPackage?: string | null;
    createdAt: string;
  }>;
  hotCases: HotCase[];
  attentionCompanies: Array<{
    tenantId: string;
    name: string;
    status: string;
    packageCode: string;
  }>;
  topCollectors: TopCollector[];
  series: Array<{ label: string; amount: number }>;
};

/** Card heading in the rucky-rentals style: title, small subtitle, quiet action link. */
function PanelHeader({
  title,
  sub,
  to,
  action,
}: {
  title: string;
  sub?: string;
  to?: string;
  action?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line-soft px-5 pb-3.5 pt-[18px]">
      <div className="min-w-0">
        <h3 className="text-sm font-semibold tracking-[-0.2px] text-ink">{title}</h3>
        {sub ? <p className="mt-0.5 text-xs text-faint">{sub}</p> : null}
      </div>
      {to && action ? (
        <Link to={to} className="shrink-0 text-[12.5px] font-medium text-brand-600 hover:underline">
          {action}
        </Link>
      ) : null}
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="px-5 py-10 text-center text-sm text-muted">{children}</p>;
}

/** Accent colour for charts, read from the active theme so it follows light/dark. */
function useAccent() {
  const { theme } = useTheme();
  return useMemo(() => {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--brand-600').trim();
    return v ? `rgb(${v})` : '#2563eb';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);
}

/**
 * Admin console home — KPIs for the managed-collections network.
 */
export default function AdminDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', 'platform'],
    queryFn: async () =>
      (await api.get<PlatformDashboard>('/dashboard/platform')).data,
  });

  if (isLoading || !data) {
    return (
      <Center>
        <Spinner />
      </Center>
    );
  }

  if (data.view === 'collector') {
    return <CollectorDashboard data={data} />;
  }

  if (data.view === 'master') {
    return <MasterDashboard data={data} />;
  }

  return <NetworkDashboard data={data} />;
}

function NetworkDashboard({ data }: { data: PlatformDashboard }) {
  const k = data.kpis;
  const accent = useAccent();

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Headphones}
          label="Open cases"
          value={k.openCases ?? 0}
          hint={`${k.unassignedCases ?? 0} unassigned`}
          tone="brand"
        />
        <StatCard icon={Wallet} label="Overdue book" value={money(k.overdueBook ?? 0)} tone="red" />
        <StatCard
          icon={Inbox}
          label="New demo leads"
          value={k.demoNew ?? 0}
          hint={`${k.demoPipeline ?? 0} in pipeline`}
          tone="green"
        />
        <StatCard
          icon={Lock}
          label="Locked devices"
          value={k.lockedDevices ?? 0}
          hint={`${k.pastDueSubscriptions ?? 0} past-due subs`}
          tone="amber"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_340px]">
        <Card>
          <PanelHeader
            title="Priority cases"
            sub="Highest days overdue"
            to="/cases"
            action="View all"
          />
          <CasesTable rows={data.hotCases} empty="No open cases" />
        </Card>

        <div className="space-y-4">
          <Card>
            <PanelHeader title="Demo requests" sub="Leads waiting on sales" to="/demo-requests" action="View all" />
            {data.recentLeads.length === 0 ? (
              <Empty>No open leads</Empty>
            ) : (
              <ul>
                {data.recentLeads.map((l) => {
                  const d = new Date(l.createdAt);
                  return (
                    <li key={l.id} className="border-b border-line-soft last:border-b-0">
                      <Link
                        to="/demo-requests"
                        className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-hover"
                      >
                        <div className="w-9 shrink-0 text-center">
                          <div className="text-[17px] font-semibold leading-none text-ink">
                            {d.getDate()}
                          </div>
                          <div className="mt-0.5 text-[10px] uppercase tracking-wide text-faint">
                            {d.toLocaleDateString('en', { month: 'short' })}
                          </div>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-medium text-ink">{l.companyName}</p>
                          <p className="truncate text-[11.5px] text-muted">
                            {l.fullName} · {l.phone}
                          </p>
                        </div>
                        <StatusPill status={l.status} />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card>
            <PanelHeader title="Companies to review" sub="Pending or past due" />
            {data.attentionCompanies.length === 0 ? (
              <Empty>All subscriptions healthy</Empty>
            ) : (
              <ul>
                {data.attentionCompanies.map((c) => (
                  <li key={c.tenantId} className="border-b border-line-soft last:border-b-0">
                    <Link
                      to={`/companies/${c.tenantId}`}
                      className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-hover"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-medium text-ink">{c.name}</p>
                        <p className="text-[11.5px] text-muted">{c.packageCode}</p>
                      </div>
                      <StatusPill status={c.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <PanelHeader title="Collections" sub="Confirmed repayments across all companies, last 6 months" />
          <div className="h-56 px-3 pb-4 pt-4">
            {data.series.length === 0 || data.series.every((s) => s.amount === 0) ? (
              <EmptyState title="No collections yet" hint="Payments will appear here once sellers start collecting." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.series} barCategoryGap={24}>
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: 'var(--muted)', fontSize: 12 }}
                  />
                  <Tooltip
                    cursor={{ fill: 'var(--hover)' }}
                    formatter={(v: number) => money(v)}
                    contentStyle={{
                      borderRadius: 10,
                      border: '1px solid var(--line)',
                      background: 'var(--surface)',
                      color: 'var(--ink)',
                      fontSize: 13,
                    }}
                  />
                  <Bar dataKey="amount" fill={accent} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card>
          <PanelHeader title="Today’s collectors" sub="Follow-ups and calls" to="/call-centre" action="Open call centre" />
          {data.topCollectors.length === 0 ? (
            <Empty>No activity yet today</Empty>
          ) : (
            <ul>
              {data.topCollectors.map((c) => (
                <li
                  key={c.collectorId}
                  className="flex items-center justify-between gap-3 border-b border-line-soft px-5 py-3 last:border-b-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium text-ink">{c.collectorName}</p>
                    <p className="text-[11.5px] text-muted">
                      {c.callsCount} calls · {c.hoursWorked.toFixed(1)}h
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold tabular-nums text-ink">{c.followUpsCount}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function MasterDashboard({ data }: { data: PlatformDashboard }) {
  const k = data.kpis;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={UserCheck} label="Team" value={k.teamSize ?? 0} tone="brand" />
        <StatCard
          icon={Headphones}
          label="Open cases"
          value={k.openCases ?? 0}
          hint={`${k.unassignedCases ?? 0} unassigned`}
          tone="amber"
        />
        <StatCard icon={PhoneCall} label="Follow-ups today" value={k.followUpsToday ?? 0} tone="green" />
        <StatCard icon={Wallet} label="Team overdue book" value={money(k.overdueBook ?? 0)} tone="red" />
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_340px]">
        <Card>
          <PanelHeader title="Priority cases" sub="Team + unassigned pool" to="/cases" action="View all" />
          <CasesTable rows={data.hotCases} empty="No open cases" />
        </Card>
        <Card>
          <PanelHeader title="Team today" sub="Follow-ups and calls" />
          {data.topCollectors.length === 0 ? (
            <Empty>No activity yet today</Empty>
          ) : (
            <ul>
              {data.topCollectors.map((c) => (
                <li
                  key={c.collectorId}
                  className="flex items-center justify-between gap-3 border-b border-line-soft px-5 py-3 last:border-b-0"
                >
                  <p className="truncate text-[13px] font-medium text-ink">{c.collectorName}</p>
                  <p className="shrink-0 text-xs tabular-nums text-muted">
                    {c.followUpsCount} FU · {c.callsCount} calls
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function CollectorDashboard({ data }: { data: PlatformDashboard }) {
  const k = data.kpis;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Headphones} label="My open cases" value={k.openCases ?? 0} tone="brand" />
        <StatCard icon={PhoneCall} label="Follow-ups today" value={k.followUpsToday ?? 0} tone="green" />
        <StatCard
          icon={Target}
          label="Calls / SMS / WA"
          value={`${k.callsToday ?? 0} / ${k.smsToday ?? 0} / ${k.whatsappToday ?? 0}`}
          tone="amber"
        />
        <StatCard icon={Wallet} label="My overdue book" value={money(k.overdueBook ?? 0)} tone="red" />
      </div>
      <Card>
        <PanelHeader title="My priority cases" sub="Highest days overdue" to="/cases" action="Open cases" />
        <CasesTable rows={data.hotCases} empty="No cases assigned to you" />
      </Card>
    </div>
  );
}

function CasesTable({ rows, empty }: { rows: HotCase[]; empty: string }) {
  const navigate = useNavigate();
  if (rows.length === 0) return <Empty>{empty}</Empty>;
  return (
    <Table columns={['Customer', 'Company', 'Assigned to', 'Overdue', 'Amount']}>
      {rows.map((c) => (
        <Row key={c.id} onClick={() => navigate(`/cases/${c.id}`)}>
          <td className="py-3">
            <p className="font-medium text-ink">{c.customerName ?? 'Customer'}</p>
            {c.customerPhone ? <p className="text-[11.5px] text-muted">{c.customerPhone}</p> : null}
          </td>
          <td className="py-3 text-muted">{c.companyName}</td>
          <td className="py-3 text-muted">{c.assignedTo ?? 'Unassigned'}</td>
          <td className="py-3">
            <span className="text-[12.5px] font-semibold text-rose-600 dark:text-rose-400">{c.daysOverdue}d</span>
          </td>
          <td className="py-3 text-right font-semibold tabular-nums text-ink">
            {money(c.amountDue, c.currency)}
          </td>
        </Row>
      ))}
    </Table>
  );
}
