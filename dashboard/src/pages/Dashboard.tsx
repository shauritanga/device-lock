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
  Smartphone,
  Lock,
  AlertTriangle,
  Wallet,
} from 'lucide-react';
import { api } from '../api/client';
import type { DashboardSummary, Payment } from '../api/types';
import { Card, CardHeader } from '../components/ui/Card';
import { StatCard } from '../components/StatCard';
import { StatusPill } from '../components/ui/Pill';
import { Center, EmptyState, Spinner } from '../components/ui/misc';
import { money, shortDate } from '../lib/format';

// Device-status donut: brand for the healthy majority, semantic hues for the
// rest. Order matches the `donut` array below (Active / Locked / Pending / Released).
const DONUT_COLORS = ['#4f46e5', '#f43f5e', '#f59e0b', '#94a3b8'];

export default function Dashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => (await api.get<DashboardSummary>('/dashboard/summary')).data,
  });
  const { data: payments } = useQuery({
    queryKey: ['payments', 'recent'],
    queryFn: async () => (await api.get<Payment[]>('/payments')).data,
  });

  if (isLoading || !data) return <Center><Spinner /></Center>;

  const donut = [
    { name: 'Active', value: data.devices.active },
    { name: 'Locked', value: data.devices.locked },
    { name: 'Pending', value: data.devices.pending },
    { name: 'Released', value: data.devices.released },
  ].filter((d) => d.value > 0);

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Smartphone} label="Active devices" value={data.devices.active} tone="green" />
        <StatCard icon={Lock} label="Locked devices" value={data.devices.locked} tone="red" />
        <StatCard
          icon={AlertTriangle}
          label="Overdue installments"
          value={data.overdueInstallments}
          tone="amber"
        />
        <StatCard
          icon={Wallet}
          label="Collections (this month)"
          value={money(data.collectionsThisMonth)}
          tone="brand"
        />
      </div>

      {/* Chart + donut */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Collections" subtitle="Confirmed payments, last 6 months" />
          <div className="h-72 px-3 pb-4 pt-6">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.series} barCategoryGap={24}>
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: '#64748b', fontSize: 12 }}
                />
                <Tooltip
                  cursor={{ fill: '#eef2ff' }}
                  formatter={(v: number) => money(v)}
                  contentStyle={{
                    borderRadius: 12,
                    border: '1px solid #e9edf3',
                    boxShadow: '0 4px 12px rgba(15,23,42,0.08)',
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
          </div>
        </Card>

        <Card>
          <CardHeader title="Device status" subtitle={`${data.devices.total} total`} />
          <div className="flex h-72 flex-col px-4 pb-4">
            {donut.length === 0 ? (
              <EmptyState title="No devices yet" />
            ) : (
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
                      <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              </div>
            )}
            <div className="mt-2 flex flex-wrap justify-center gap-3">
              {donut.map((d, i) => (
                <span key={d.name} className="flex items-center gap-1.5 text-xs text-muted">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }}
                  />
                  {d.name} ({d.value})
                </span>
              ))}
            </div>
          </div>
        </Card>
      </div>

      {/* Recent payments */}
      <Card>
        <CardHeader title="Recent payments" subtitle="Latest collections across your loans" />
        <div className="px-3 pb-3 pt-4">
          {!payments || payments.length === 0 ? (
            <EmptyState title="No payments yet" hint="Record a payment from the Payments page." />
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
                    <td className="px-4 py-3"><StatusPill status={p.status} /></td>
                    <td className="px-4 py-3 text-muted tabular-nums">{shortDate(p.receivedAt)}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">{money(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </div>
  );
}
