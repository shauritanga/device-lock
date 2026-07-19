import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ReceiptText, WalletCards } from 'lucide-react';
import { api } from '../api/client';
import type { BillingInvoice, BillingSummary } from '../api/types';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { StatusPill } from '../components/ui/Pill';
import { Center, EmptyState, Spinner } from '../components/ui/misc';
import { shortDate } from '../lib/format';

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

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Metric label="Plan" value={data.tenant.billingPlan} />
        <Metric label="Subscription" value={data.tenant.subscriptionStatus} />
        <Metric label="Active devices" value={data.usage.activeDevices.toLocaleString()} />
        <Metric label="Current estimate" value={`TZS ${data.estimate.total.toLocaleString()}`} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_0.9fr]">
        <Card>
          <CardHeader
            title="Current month estimate"
            subtitle={`${shortDate(data.period.start)} to ${shortDate(data.period.end)}`}
            action={
              <Button onClick={() => generate.mutate()} disabled={generate.isPending}>
                <ReceiptText className="h-4 w-4" /> Generate invoice
              </Button>
            }
          />
          <div className="p-6">
            <div className="divide-y divide-line rounded-xl border border-line bg-white">
              {data.estimate.lineItems.map((item) => (
                <div key={item.label} className="grid grid-cols-[1fr_auto] gap-4 px-4 py-3 text-sm">
                  <div>
                    <p className="font-medium">{item.label}</p>
                    <p className="text-xs text-muted">{item.quantity.toLocaleString()} × TZS {item.unitPrice.toLocaleString()}</p>
                  </div>
                  <p className="font-semibold">TZS {item.amount.toLocaleString()}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between rounded-xl bg-brand-50 px-4 py-3 text-brand-800">
              <span className="font-semibold">Estimated total</span>
              <span className="text-lg font-bold">TZS {data.estimate.total.toLocaleString()}</span>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Usage bundles" subtitle="Billable activity this month" />
          <dl className="grid grid-cols-2 gap-4 p-6 text-sm">
            <Info label="SMS" value={data.usage.smsCount.toLocaleString()} />
            <Info label="Voice/IVR" value={data.usage.voiceCount.toLocaleString()} />
            <Info label="Call-centre notes" value={data.usage.callCentreCount.toLocaleString()} />
            <Info label="Active device count" value={data.usage.activeDevices.toLocaleString()} />
          </dl>
        </Card>
      </div>

      <Card>
        <CardHeader title="Invoices" />
        <div className="space-y-2 p-5">
          {!data.invoices.length ? <EmptyState title="No invoices yet" hint="Generate the current invoice to start billing history." /> : data.invoices.map((invoice) => (
            <div key={invoice.id} className="flex items-center justify-between rounded-xl bg-white px-4 py-3 text-sm">
              <div>
                <p className="font-medium">{invoice.planName} · {shortDate(invoice.periodStart)}</p>
                <p className="text-xs text-muted">{invoice.activeDevices} devices · {invoice.smsCount} SMS · {invoice.voiceCount} voice · {invoice.callCentreCount} calls</p>
              </div>
              <div className="text-right">
                <p className="font-semibold">{invoice.currency} {Number(invoice.total).toLocaleString()}</p>
                <StatusPill status={invoice.status} />
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-brand-50 p-2.5 text-brand-700"><WalletCards className="h-5 w-5" /></div>
        <div>
          <p className="text-xs text-muted">{label}</p>
          <p className="text-lg font-bold">{value}</p>
        </div>
      </div>
    </Card>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs text-muted">{label}</dt><dd className="mt-1 text-lg font-semibold">{value}</dd></div>;
}
