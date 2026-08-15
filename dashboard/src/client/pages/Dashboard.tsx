import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from 'recharts';
import {
  AlertTriangle,
  CalendarClock,
  Smartphone,
  Wallet,
} from 'lucide-react';
import { api } from '@/shared/api/client';
import type {
  DashboardInstallmentRow,
  DashboardSummary,
  Payment,
} from '@/shared/api/types';
import { Card, CardHeader } from '@/shared/components/ui/Card';
import { StatCard } from '@/shared/components/StatCard';
import { StatusPill } from '@/shared/components/ui/Pill';
import { Center, EmptyState, Spinner } from '@/shared/components/ui/misc';
import { money, shortDate } from '@/shared/lib/format';

const DONUT_COLORS = ['#4f46e5', '#f43f5e', '#f59e0b', '#94a3b8'];

/**
 * Seller home: one KPI per signal, work lists for action, charts for trend —
 * no duplicate locked / due / overdue / collections blocks.
 */
export default function Dashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () =>
      (await api.get<DashboardSummary>('/dashboard/summary')).data,
  });
  const { data: payments } = useQuery({
    queryKey: ['payments', 'recent'],
    queryFn: async () => (await api.get<Payment[]>('/payments')).data,
  });

  if (isLoading || !data) {
    return (
      <Center>
        <Spinner />
      </Center>
    );
  }

  const donut = [
    { name: 'Active', value: data.devices.active },
    { name: 'Locked', value: data.devices.locked },
    { name: 'Pending', value: data.devices.pending },
    { name: 'Released', value: data.devices.released },
  ].filter((d) => d.value > 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Smartphone}
          label="Active devices"
          value={data.devices.active}
          hint={`${data.devices.total} total`}
          tone="green"
        />
        <StatCard
          icon={CalendarClock}
          label="Due today"
          value={data.dueTodayInstallments}
          tone="amber"
        />
        <StatCard
          icon={AlertTriangle}
          label="Overdue book"
          value={money(data.overdueAmount)}
          hint={`${data.overdueInstallments} installment${data.overdueInstallments === 1 ? '' : 's'}`}
          tone="red"
        />
        <StatCard
          icon={Wallet}
          label="Collected this month"
          value={money(data.collectionsThisMonth)}
          tone="brand"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <WorkList
          title="Due today"
          subtitle="Remind these customers before close of business"
          rows={data.dueToday}
          empty="Nothing due today"
          href="/loans"
        />
        <WorkList
          title="Overdue"
          subtitle="Priority follow-up — unlock risk if unpaid"
          rows={data.overdueAccounts}
          empty="No overdue accounts"
          href="/loans"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Collections trend"
            subtitle="Confirmed payments over the last 6 months"
          />
          <div className="h-72 px-3 pb-4 pt-6">
            {data.series.every((s) => s.amount === 0) ? (
              <EmptyState
                title="No collections yet"
                hint="Confirmed payments will show up here."
              />
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
                  <Bar
                    dataKey="amount"
                    radius={[8, 8, 8, 8]}
                    fill="#4f46e5"
                    isAnimationActive={false}
                    maxBarSize={64}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Device mix"
            subtitle={`${data.devices.total} enrolled`}
          />
          <div className="flex h-72 flex-col px-4 pb-4">
            {donut.length === 0 ? (
              <EmptyState title="No devices yet" hint="Enroll phones from Devices or Sales." />
            ) : (
              <>
                <div className="min-h-0 flex-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={donut}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={55}
                        outerRadius={90}
                        paddingAngle={3}
                        isAnimationActive={false}
                        stroke="none"
                      >
                        {donut.map((_, i) => (
                          <Cell
                            key={donut[i]!.name}
                            fill={DONUT_COLORS[i % DONUT_COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-2 flex flex-wrap justify-center gap-3">
                  {donut.map((d, i) => (
                    <span
                      key={d.name}
                      className="flex items-center gap-1.5 text-xs text-muted"
                    >
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{
                          background: DONUT_COLORS[i % DONUT_COLORS.length],
                        }}
                      />
                      {d.name} ({d.value})
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>
          {data.devices.locked > 0 ? (
            <div className="border-t border-line px-5 py-3">
              <Link
                to="/devices"
                className="text-sm font-medium text-brand-700 hover:underline"
              >
                View {data.devices.locked} locked device
                {data.devices.locked === 1 ? '' : 's'} →
              </Link>
            </div>
          ) : null}
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Recent payments"
          subtitle="Latest confirmed collections"
        />
        <div className="px-3 pb-3 pt-2">
          {!payments || payments.length === 0 ? (
            <EmptyState
              title="No payments yet"
              hint="Record a payment from the Payments page."
            />
          ) : (
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-4 py-2 font-medium">Method</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Date</th>
                  <th className="px-4 py-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {payments.slice(0, 6).map((p) => (
                  <tr key={p.id} className="border-t border-line text-sm">
                    <td className="px-4 py-3 font-medium">{p.method}</td>
                    <td className="px-4 py-3">
                      <StatusPill status={p.status} />
                    </td>
                    <td className="px-4 py-3 tabular-nums text-muted">
                      {shortDate(p.receivedAt)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">
                      {money(p.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {payments && payments.length > 0 ? (
          <div className="border-t border-line px-5 py-3">
            <Link
              to="/payments"
              className="text-sm font-medium text-brand-700 hover:underline"
            >
              All payments →
            </Link>
          </div>
        ) : null}
      </Card>
    </div>
  );
}

function WorkList({
  title,
  subtitle,
  rows,
  empty,
  href,
}: {
  title: string;
  subtitle: string;
  rows: DashboardInstallmentRow[];
  empty: string;
  href: string;
}) {
  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} />
      <div className="divide-y divide-line px-5 pb-1">
        {rows.length === 0 ? (
          <div className="py-8">
            <EmptyState title={empty} />
          </div>
        ) : (
          rows.map((row) => (
            <div key={row.id} className="flex items-start justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate font-medium text-ink">
                  {row.customerName ?? 'Unknown customer'}
                </p>
                <p className="truncate text-xs text-muted">
                  {row.customerPhone ?? 'No phone'}
                  {row.deviceImei ? ` · ${row.deviceImei}` : ''}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-semibold tabular-nums text-ink">
                  {money(row.amountDue)}
                </p>
                <p className="text-xs text-muted">Due {shortDate(row.dueDate)}</p>
              </div>
            </div>
          ))
        )}
      </div>
      <div className="border-t border-line px-5 py-3">
        <Link to={href} className="text-sm font-medium text-brand-700 hover:underline">
          Open loans →
        </Link>
      </div>
    </Card>
  );
}
