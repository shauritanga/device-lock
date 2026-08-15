import { Link } from 'react-router-dom';
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
import { Card, CardHeader } from '@/shared/components/ui/Card';
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

  const k = data.kpis;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="hidden text-xl font-bold tracking-tight text-ink md:block">Dashboard</h1>
        <p className="mt-0.5 text-sm text-muted">
          Network health across companies, cases, collectors, and inbound leads.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Headphones}
          label="Open cases"
          value={k.openCases ?? 0}
          hint={`${k.unassignedCases ?? 0} unassigned`}
          tone="amber"
        />
        <StatCard
          icon={Wallet}
          label="Overdue book"
          value={money(k.overdueBook ?? 0)}
          tone="red"
        />
        <StatCard
          icon={Inbox}
          label="New demo leads"
          value={k.demoNew ?? 0}
          hint={`${k.demoPipeline ?? 0} in pipeline`}
          tone="amber"
        />
        <StatCard
          icon={Lock}
          label="Locked devices"
          value={k.lockedDevices ?? 0}
          hint={`${k.pastDueSubscriptions ?? 0} past-due subs`}
          tone="red"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Collections"
            subtitle="Confirmed repayments across all companies, last 6 months"
          />
          <div className="h-48 px-3 pb-4 pt-4 sm:h-64">
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
                    cursor={{ fill: 'var(--canvas)' }}
                    formatter={(v: number) => money(v)}
                    contentStyle={{
                      borderRadius: 12,
                      border: '1px solid var(--line)',
                      background: 'var(--surface)',
                      color: 'var(--ink)',
                      fontSize: 13,
                    }}
                  />
                  <Bar dataKey="amount" fill="#4f46e5" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Today’s collectors" subtitle="Follow-ups and calls" />
          <div className="divide-y divide-line px-5 pb-3">
            {data.topCollectors.length === 0 ? (
              <div className="py-8">
                <EmptyState title="No activity yet today" />
              </div>
            ) : (
              data.topCollectors.map((c) => (
                <div key={c.collectorId} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink">{c.collectorName}</p>
                    <p className="text-xs text-muted">
                      {c.callsCount} calls · {c.hoursWorked.toFixed(1)}h
                    </p>
                  </div>
                  <p className="shrink-0 tabular-nums font-semibold text-ink">
                    {c.followUpsCount}
                  </p>
                </div>
              ))
            )}
          </div>
          <div className="border-t border-line px-5 py-3">
            <Link to="/call-centre" className="text-sm font-medium text-brand-700 hover:underline">
              Open call centre →
            </Link>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card>
          <CardHeader title="Priority cases" subtitle="Highest days overdue" />
          <CaseList rows={data.hotCases} empty="No open cases" />
          <div className="border-t border-line px-5 py-3">
            <Link to="/cases" className="text-sm font-medium text-brand-700 hover:underline">
              View all cases →
            </Link>
          </div>
        </Card>

        <Card>
          <CardHeader title="Demo requests" subtitle="Leads waiting on sales" />
          <div className="divide-y divide-line px-5 pb-2">
            {data.recentLeads.length === 0 ? (
              <div className="py-8">
                <EmptyState title="No open leads" />
              </div>
            ) : (
              data.recentLeads.map((l) => (
                <Link
                  key={l.id}
                  to="/demo-requests"
                  className="block py-3 transition hover:opacity-80"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-ink">{l.companyName}</p>
                      <p className="truncate text-xs text-muted">
                        {l.fullName} · {l.phone}
                      </p>
                    </div>
                    <StatusPill status={l.status} />
                  </div>
                  <p className="mt-1 text-xs text-faint">{shortDate(l.createdAt)}</p>
                </Link>
              ))
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Companies to review" subtitle="Pending or past due" />
          <div className="divide-y divide-line px-5 pb-2">
            {data.attentionCompanies.length === 0 ? (
              <div className="py-8">
                <EmptyState title="All subscriptions healthy" />
              </div>
            ) : (
              data.attentionCompanies.map((c) => (
                <Link
                  key={c.tenantId}
                  to={`/companies/${c.tenantId}`}
                  className="flex items-center justify-between gap-3 py-3 transition hover:opacity-80"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink">{c.name}</p>
                    <p className="text-xs text-muted">{c.packageCode}</p>
                  </div>
                  <StatusPill status={c.status} />
                </Link>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function MasterDashboard({ data }: { data: PlatformDashboard }) {
  const k = data.kpis;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="hidden text-xl font-bold tracking-tight text-ink md:block">Dashboard</h1>
        <p className="mt-0.5 text-sm text-muted">Your team’s queue and today’s performance.</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={UserCheck} label="Team" value={k.teamSize ?? 0} tone="brand" />
        <StatCard
          icon={Headphones}
          label="Open cases"
          value={k.openCases ?? 0}
          hint={`${k.unassignedCases ?? 0} unassigned`}
          tone="amber"
        />
        <StatCard icon={PhoneCall} label="Follow-ups today" value={k.followUpsToday ?? 0} tone="brand" />
        <StatCard icon={Wallet} label="Team overdue book" value={money(k.overdueBook ?? 0)} tone="red" />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Priority cases" subtitle="Team + unassigned pool" />
          <CaseList rows={data.hotCases} empty="No open cases" />
        </Card>
        <Card>
          <CardHeader title="Team today" subtitle="Follow-ups and calls" />
          <div className="divide-y divide-line px-5 pb-3">
            {data.topCollectors.length === 0 ? (
              <div className="py-8">
                <EmptyState title="No activity yet today" />
              </div>
            ) : (
              data.topCollectors.map((c) => (
                <div key={c.collectorId} className="flex justify-between gap-3 py-3 text-sm">
                  <p className="font-medium text-ink">{c.collectorName}</p>
                  <p className="tabular-nums text-muted">
                    {c.followUpsCount} FU · {c.callsCount} calls
                  </p>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function CollectorDashboard({ data }: { data: PlatformDashboard }) {
  const k = data.kpis;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="hidden text-xl font-bold tracking-tight text-ink md:block">Dashboard</h1>
        <p className="mt-0.5 text-sm text-muted">Your cases and today’s work.</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Headphones} label="My open cases" value={k.openCases ?? 0} tone="brand" />
        <StatCard icon={PhoneCall} label="Follow-ups today" value={k.followUpsToday ?? 0} tone="amber" />
        <StatCard
          icon={Target}
          label="Calls / SMS / WA"
          value={`${k.callsToday ?? 0} / ${k.smsToday ?? 0} / ${k.whatsappToday ?? 0}`}
          tone="brand"
        />
        <StatCard icon={Wallet} label="My overdue book" value={money(k.overdueBook ?? 0)} tone="red" />
      </div>
      <Card>
        <CardHeader title="My priority cases" subtitle="Highest days overdue" />
        <CaseList rows={data.hotCases} empty="No cases assigned to you" />
        <div className="border-t border-line px-5 py-3">
          <Link to="/cases" className="text-sm font-medium text-brand-700 hover:underline">
            Open cases →
          </Link>
        </div>
      </Card>
    </div>
  );
}

function CaseList({ rows, empty }: { rows: HotCase[]; empty: string }) {
  if (rows.length === 0) {
    return (
      <div className="px-5 py-8">
        <EmptyState title={empty} />
      </div>
    );
  }
  return (
    <div className="divide-y divide-line px-5 pb-2">
      {rows.map((c) => (
        <Link
          key={c.id}
          to={`/cases/${c.id}`}
          className="block py-3 transition hover:opacity-80"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-medium text-ink">
                {c.customerName ?? 'Customer'}
              </p>
              <p className="truncate text-xs text-muted">
                {c.companyName}
                {c.assignedTo ? ` · ${c.assignedTo}` : ' · Unassigned'}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-xs font-semibold text-rose-600">{c.daysOverdue}d</p>
              <p className="text-xs tabular-nums text-muted">
                {money(c.amountDue, c.currency)}
              </p>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
