import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessagesSquare, ReceiptText, Smartphone, WalletCards } from 'lucide-react';
import { api } from '@/shared/api/client';
import type { BillingInvoice, BillingSummary } from '@/shared/api/types';
import { Card, CardHeader } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { StatusPill } from '@/shared/components/ui/Pill';
import { Table, Row } from '@/shared/components/ui/Table';
import { StatCard } from '@/shared/components/StatCard';
import { Center, EmptyState, Spinner } from '@/shared/components/ui/misc';
import { money, shortDate } from '@/shared/lib/format';

export default function Billing() {
  const qc = useQueryClient();
  const summary = useQuery({
    queryKey: ['billing', 'summary'],
    queryFn: async () => (await api.get<BillingSummary>('/billing/summary')).data,
  });
  const generate = useMutation({
    mutationFn: async () => (await api.post<BillingInvoice>('/billing/invoices/generate')).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['billing'] }),
  });

  if (summary.isLoading || !summary.data) return <Center><Spinner /></Center>;
  const data = summary.data;
  const activityTotal =
    data.usage.smsCount + data.usage.voiceCount + data.usage.callCentreCount;

  return (
    <div className="space-y-6">
      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
              <WalletCards className="h-5 w-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-lg font-bold tracking-tight">
                  {titleCase(data.tenant.billingPlan)} plan
                </span>
                <StatusPill status={data.tenant.subscriptionStatus} />
              </div>
              <p className="mt-0.5 text-sm text-muted">
                Billing period {shortDate(data.period.start)} – {shortDate(data.period.end)}
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <Button onClick={() => generate.mutate()} disabled={generate.isPending}>
              <ReceiptText className="h-4 w-4" />
              {generate.isPending ? 'Generating…' : 'Generate invoice'}
            </Button>
            {generate.isError && (
              <p className="text-xs text-rose-600">Could not generate the invoice.</p>
            )}
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          icon={ReceiptText}
          label="Current estimate"
          value={money(data.estimate.total)}
          hint="for this period"
          tone="brand"
        />
        <StatCard
          icon={Smartphone}
          label="Active devices"
          value={data.usage.activeDevices.toLocaleString()}
          tone="green"
        />
        <StatCard
          icon={MessagesSquare}
          label="Billable activity"
          value={activityTotal.toLocaleString()}
          hint="SMS · voice · call notes"
          tone="amber"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_0.9fr]">
        <Card>
          <CardHeader
            title="Current month estimate"
            subtitle={`${shortDate(data.period.start)} to ${shortDate(data.period.end)}`}
          />
          <div className="divide-y divide-line px-5 pt-2">
            {data.estimate.lineItems.map((item) => (
              <div key={item.label} className="flex items-start justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{item.label}</p>
                  <p className="mt-0.5 text-xs tabular-nums text-muted">
                    {item.quantity.toLocaleString()} × {money(item.unitPrice)}
                  </p>
                </div>
                <p className="shrink-0 font-semibold tabular-nums">{money(item.amount)}</p>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between border-t border-line px-5 py-4">
            <span className="text-sm font-semibold">Estimated total</span>
            <span className="text-xl font-bold tabular-nums tracking-tight">
              {money(data.estimate.total)}
            </span>
          </div>
        </Card>

        <Card>
          <CardHeader title="Usage breakdown" subtitle="Billable activity this month" />
          <div className="space-y-5 px-5 pb-6 pt-4">
            <UsageRow
              label="SMS reminders"
              count={data.usage.smsCount}
              total={activityTotal}
            />
            <UsageRow
              label="Voice / IVR calls"
              count={data.usage.voiceCount}
              total={activityTotal}
            />
            <UsageRow
              label="Call-centre notes"
              count={data.usage.callCentreCount}
              total={activityTotal}
            />
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Invoices" subtitle="Generated billing history" />
        <div className="p-3">
          {!data.invoices.length ? (
            <EmptyState
              title="No invoices yet"
              hint="Generate the current invoice to start billing history."
            />
          ) : (
            <Table columns={['Period', 'Plan', 'Devices', 'Total', 'Status']}>
              {data.invoices.map((invoice) => (
                <Row key={invoice.id}>
                  <td className="whitespace-nowrap px-4 py-3 text-muted">
                    {shortDate(invoice.periodStart)} – {shortDate(invoice.periodEnd)}
                  </td>
                  <td className="px-4 py-3 font-medium">{invoice.planName}</td>
                  <td className="px-4 py-3 tabular-nums text-muted">
                    {invoice.activeDevices.toLocaleString()} devices ·{' '}
                    {invoice.smsCount.toLocaleString()} SMS ·{' '}
                    {invoice.voiceCount.toLocaleString()} voice ·{' '}
                    {invoice.callCentreCount.toLocaleString()} calls
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-semibold tabular-nums">
                    {money(invoice.total, invoice.currency)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <StatusPill status={invoice.status} />
                  </td>
                </Row>
              ))}
            </Table>
          )}
        </div>
      </Card>
    </div>
  );
}

function UsageRow({ label, count, total }: { label: string; count: number; total: number }) {
  const share = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-muted">
          <span className="font-semibold text-ink">{count.toLocaleString()}</span>
          {total > 0 ? ` · ${share}%` : ''}
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-canvas">
        <div className="h-full rounded-full bg-brand-600" style={{ width: `${share}%` }} />
      </div>
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
