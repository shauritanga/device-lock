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
} from '@/shared/icons';
import { api } from '@/shared/api/client';
import type {
  DashboardInstallmentRow,
  DashboardSummary,
  Payment,
} from '@/shared/api/types';
import { Card } from '@/shared/components/ui/Card';
import { PanelEmpty, PanelHeader, useAccent } from '@/shared/components/Panel';
import { Table, Row } from '@/shared/components/ui/Table';
import { StatCard } from '@/shared/components/StatCard';
import { StatusPill } from '@/shared/components/ui/Pill';
import { Center, EmptyState, Spinner } from '@/shared/components/ui/misc';
import { money, shortDate } from '@/shared/lib/format';

/**
 * Seller home — rucky-rentals layout: KPI tiles, the work that needs doing
 * (overdue table + due-today list), then trend and mix charts and recent payments.
 */
export default function Dashboard() {
  const accent = useAccent();
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

  // Active follows the theme accent; the rest are fixed semantic colours.
  const donut = [
    { name: 'Active', value: data.devices.active, color: accent },
    { name: 'Locked', value: data.devices.locked, color: '#ef4444' },
    { name: 'Pending', value: data.devices.pending, color: '#f59e0b' },
    { name: 'Released', value: data.devices.released, color: '#8b8d96' },
  ].filter((d) => d.value > 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Smartphone}
          label="Active devices"
          value={data.devices.active}
          hint={`${data.devices.total} total`}
          tone="brand"
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
          tone="green"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_340px]">
        <Card>
          <PanelHeader
            title="Overdue"
            sub="Priority follow-up — unlock risk if unpaid"
            to="/sales"
            action="Open sales"
          />
          {data.overdueAccounts.length === 0 ? (
            <PanelEmpty>No overdue accounts</PanelEmpty>
          ) : (
            <Table columns={['Customer', 'Device', 'Due', 'Amount']}>
              {data.overdueAccounts.map((row) => (
                <Row key={row.id}>
                  <td className="py-3">
                    <p className="font-medium text-ink">{row.customerName ?? 'Unknown customer'}</p>
                    <p className="text-[11.5px] text-muted">{row.customerPhone ?? 'No phone'}</p>
                  </td>
                  <td className="py-3 font-mono text-xs text-muted">{row.deviceImei ?? '—'}</td>
                  <td className="py-3 text-rose-600 dark:text-rose-400">{shortDate(row.dueDate)}</td>
                  <td className="py-3 text-right font-semibold tabular-nums text-ink">
                    {money(row.amountDue)}
                  </td>
                </Row>
              ))}
            </Table>
          )}
        </Card>

        <Card>
          <PanelHeader
            title="Due today"
            sub="Remind these customers before close of business"
            to="/sales"
            action="Open sales"
          />
          {data.dueToday.length === 0 ? (
            <PanelEmpty>Nothing due today</PanelEmpty>
          ) : (
            <ul>
              {data.dueToday.map((row) => (
                <li
                  key={row.id}
                  className="flex items-center justify-between gap-3 border-b border-line-soft px-5 py-3 last:border-b-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium text-ink">
                      {row.customerName ?? 'Unknown customer'}
                    </p>
                    <p className="truncate text-[11.5px] text-muted">
                      {row.customerPhone ?? 'No phone'}
                      {row.deviceImei ? ` · ${row.deviceImei}` : ''}
                    </p>
                  </div>
                  <p className="shrink-0 text-[13px] font-semibold tabular-nums text-ink">
                    {money(row.amountDue)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_340px]">
        <Card>
          <PanelHeader title="Collections trend" sub="Confirmed payments over the last 6 months" />
          <div className="h-56 px-3 pb-4 pt-4">
            {data.series.every((s) => s.amount === 0) ? (
              <EmptyState title="No collections yet" hint="Confirmed payments will show up here." />
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
                  <Bar
                    dataKey="amount"
                    radius={[6, 6, 0, 0]}
                    fill={accent}
                    isAnimationActive={false}
                    maxBarSize={64}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card>
          <PanelHeader
            title="Device mix"
            sub={`${data.devices.total} enrolled`}
            to={data.devices.locked > 0 ? '/devices' : undefined}
            action={data.devices.locked > 0 ? `${data.devices.locked} locked` : undefined}
          />
          <div className="flex h-56 flex-col px-4 pb-4 pt-3">
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
                        innerRadius={45}
                        outerRadius={72}
                        paddingAngle={3}
                        isAnimationActive={false}
                        stroke="none"
                      >
                        {donut.map((d) => (
                          <Cell key={d.name} fill={d.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          borderRadius: 10,
                          border: '1px solid var(--line)',
                          background: 'var(--surface)',
                          color: 'var(--ink)',
                          fontSize: 13,
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-2 flex flex-wrap justify-center gap-3">
                  {donut.map((d) => (
                    <span key={d.name} className="flex items-center gap-1.5 text-xs text-muted">
                      <span className="h-2 w-2 rounded-full" style={{ background: d.color }} />
                      {d.name} ({d.value})
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>
        </Card>
      </div>

      <Card>
        <PanelHeader
          title="Recent payments"
          sub="Latest confirmed collections"
          to="/payments"
          action="All payments"
        />
        {!payments || payments.length === 0 ? (
          <PanelEmpty>No payments yet. Record one from the Payments page.</PanelEmpty>
        ) : (
          <Table columns={['Method', 'Status', 'Date', 'Amount']}>
            {payments.slice(0, 6).map((p) => (
              <Row key={p.id}>
                <td className="py-3 font-medium text-ink">{p.method}</td>
                <td className="py-3">
                  <StatusPill status={p.status} />
                </td>
                <td className="py-3 tabular-nums text-muted">{shortDate(p.receivedAt)}</td>
                <td className="py-3 text-right font-semibold tabular-nums text-ink">{money(p.amount)}</td>
              </Row>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
