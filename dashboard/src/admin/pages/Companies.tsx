import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/api/client';
import { Card, CardHeader } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { StatusPill } from '@/shared/components/ui/Pill';
import { EmptyState } from '@/shared/components/ui/misc';
import { Field, Input, Select } from '@/shared/components/ui/Field';
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

type SubscriptionRow = {
  id: string;
  tenantId: string;
  packageCode: string;
  status: string;
  activeDevices?: number;
  estimatedMonthly?: number;
  tenant: { id: string; name: string };
};

type Tenant = { id: string; name: string };

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

/**
 * Commercial side of the collections service: who subscribes, on what package,
 * and what they have been invoiced. Kept apart from the collector work queue so
 * neither screen has to branch on role halfway down.
 */
export default function Companies() {
  const qc = useQueryClient();
  const [activate, setActivate] = useState({
    tenantId: '',
    packageCode: 'STARTER',
    notes: '',
  });

  const packages = useQuery({
    queryKey: ['collections', 'packages'],
    queryFn: async () => (await api.get<PackageDef[]>('/collections/packages')).data,
  });

  const subscriptions = useQuery({
    queryKey: ['collections', 'subscriptions'],
    queryFn: async () =>
      (await api.get<SubscriptionRow[]>('/collections/subscriptions')).data,
  });

  const tenants = useQuery({
    queryKey: ['tenants'],
    queryFn: async () => (await api.get<Tenant[]>('/tenants')).data,
    // Only SUPER_ADMIN can list tenants; fall back to the subscription list below.
    retry: false,
  });

  const invoices = useQuery({
    queryKey: ['collections', 'invoices'],
    queryFn: async () => (await api.get<Invoice[]>('/collections/invoices')).data,
  });

  const activateSub = useMutation({
    mutationFn: async () =>
      (await api.post('/collections/subscriptions/activate', activate)).data as {
        casesSynced?: number;
      },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['collections'] }),
  });

  const generateAllInvoices = useMutation({
    mutationFn: async () =>
      (await api.post('/collections/invoices/generate-all', {})).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['collections', 'invoices'] }),
  });

  const markInvoicePaid = useMutation({
    mutationFn: async (id: string) =>
      (await api.post(`/collections/invoices/${id}/mark-paid`, {})).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['collections', 'invoices'] });
      qc.invalidateQueries({ queryKey: ['collections', 'subscriptions'] });
    },
  });

  const processPastDue = useMutation({
    mutationFn: async () =>
      (await api.post('/collections/invoices/process-past-due')).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['collections'] }),
  });

  const tenantOptions = useMemo(() => {
    if (tenants.data?.length) return tenants.data;
    return (subscriptions.data ?? []).map((s) => s.tenant);
  }, [tenants.data, subscriptions.data]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Collections packages"
          subtitle="Bands are validated against the company's active financed devices"
        />
        <div className="grid gap-3 p-5 sm:grid-cols-3">
          {(packages.data ?? []).map((p) => (
            <div
              key={p.code}
              className="rounded-xl border border-line bg-canvas/60 p-4 text-sm"
            >
              <p className="font-semibold text-ink">{p.label}</p>
              <p className="mt-1 text-muted">
                Devices {p.deviceBandMin}–{p.deviceBandMax}
              </p>
              <p className="mt-2 font-semibold tabular-nums">
                {p.priceModel === 'PER_DEVICE'
                  ? `${money(p.unitPrice ?? 0)} / device / mo`
                  : `${money(p.flatPrice ?? 0)} / mo`}
              </p>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title="Activate a company subscription" />
        <form
          className="grid gap-3 p-5 md:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            activateSub.mutate();
          }}
        >
          <Field label="Seller company">
            <Select
              value={activate.tenantId}
              onChange={(e) => setActivate({ ...activate, tenantId: e.target.value })}
              required
            >
              <option value="">Select company…</option>
              {tenantOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Package">
            <Select
              value={activate.packageCode}
              onChange={(e) => setActivate({ ...activate, packageCode: e.target.value })}
            >
              {(packages.data ?? []).map((p) => (
                <option key={p.code} value={p.code}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Notes">
            <Input
              value={activate.notes}
              onChange={(e) => setActivate({ ...activate, notes: e.target.value })}
              placeholder="Optional"
            />
          </Field>
          <div className="flex items-end">
            <Button type="submit" disabled={activateSub.isPending} className="w-full">
              {activateSub.isPending ? 'Activating…' : 'Activate'}
            </Button>
          </div>
          {activateSub.isError ? (
            <p className="text-sm text-rose-600 md:col-span-4">
              Activation failed — check the device count matches the package band.
            </p>
          ) : null}
          {activateSub.isSuccess ? (
            <p className="text-sm text-emerald-700 md:col-span-4">
              Activated. Cases synced: {activateSub.data?.casesSynced ?? 0}
            </p>
          ) : null}
        </form>
      </Card>

      <Card>
        <CardHeader title="Subscribed companies" />
        {!subscriptions.data?.length ? (
          <div className="p-5">
            <EmptyState
              title="No active subscriptions"
              hint="Activate a company above to start routing its overdue cases."
            />
          </div>
        ) : (
          <div className="divide-y divide-line px-2 pb-2">
            {subscriptions.data.map((s) => (
              <div
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-3 text-sm"
              >
                <div>
                  <p className="font-semibold">{s.tenant.name}</p>
                  <p className="text-muted">
                    {s.packageCode} · devices {s.activeDevices ?? '—'} · est.{' '}
                    {money(s.estimatedMonthly ?? 0)}/mo
                  </p>
                </div>
                <StatusPill status={s.status} />
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Collections invoices"
          subtitle="Managed follow-up packages, separate from platform SaaS billing"
          action={
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() => generateAllInvoices.mutate()}
                disabled={generateAllInvoices.isPending}
              >
                {generateAllInvoices.isPending ? 'Generating…' : 'Generate this month'}
              </Button>
              <Button
                variant="ghost"
                onClick={() => processPastDue.mutate()}
                disabled={processPastDue.isPending}
              >
                Process past due
              </Button>
            </div>
          }
        />
        {!invoices.data?.length ? (
          <div className="p-5">
            <EmptyState
              title="No collections invoices yet"
              hint="Activate subscriptions, then generate this month."
            />
          </div>
        ) : (
          <div className="divide-y divide-line px-2 pb-2">
            {invoices.data.map((inv) => (
              <div
                key={inv.id}
                className="flex flex-wrap items-center justify-between gap-3 px-3 py-3 text-sm"
              >
                <div>
                  <p className="font-semibold">
                    {inv.tenant.name} · {inv.packageCode}
                  </p>
                  <p className="text-xs text-muted">
                    {shortDate(inv.periodStart)} – {shortDate(inv.periodEnd)} ·{' '}
                    {inv.activeDevices} devices · due {shortDate(inv.dueDate)}
                    {inv.paidAt ? ` · paid ${shortDate(inv.paidAt)}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="font-semibold tabular-nums">{money(inv.total)}</p>
                  <StatusPill status={inv.status} />
                  {inv.status === 'OPEN' || inv.status === 'PAST_DUE' ? (
                    <Button
                      variant="secondary"
                      className="!py-1.5 !text-xs"
                      onClick={() => markInvoicePaid.mutate(inv.id)}
                      disabled={markInvoicePaid.isPending}
                    >
                      Mark paid
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
