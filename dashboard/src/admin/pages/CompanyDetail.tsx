import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Building2,
  FileText,
  Package,
  Search,
  Wallet,
  X,
} from 'lucide-react';
import { api } from '@/shared/api/client';
import { StatCard } from '@/shared/components/StatCard';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Table, Row } from '@/shared/components/ui/Table';
import { StatusPill } from '@/shared/components/ui/Pill';
import { EmptyState, Center, Spinner } from '@/shared/components/ui/misc';
import { Modal } from '@/shared/components/ui/Modal';
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

type Tenant = {
  id: string;
  name: string;
  isActive?: boolean;
  billingPlan?: string;
  subscriptionStatus?: string;
};

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

type BillingSummary = {
  subscription: {
    id: string;
    packageCode: string;
    status: string;
    notes?: string | null;
    activatedAt?: string | null;
  } | null;
  activeDevices: number;
  suggestedPackage: string | null;
  estimatedMonthly: number | null;
  openBalance: number;
  invoices: Invoice[];
};

/**
 * Per-company collections commercial view: subscription + invoices.
 */
export default function CompanyDetail() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [activateOpen, setActivateOpen] = useState(false);
  const [packageCode, setPackageCode] = useState('STARTER');
  const [notes, setNotes] = useState('');
  const [invSearch, setInvSearch] = useState('');
  const [invStatus, setInvStatus] = useState('');

  const tenant = useQuery({
    queryKey: ['tenants', id],
    queryFn: async () => (await api.get<Tenant>(`/tenants/${id}`)).data,
    enabled: !!id,
    retry: false,
  });

  const packages = useQuery({
    queryKey: ['collections', 'packages'],
    queryFn: async () => (await api.get<PackageDef[]>('/collections/packages')).data,
  });

  const billing = useQuery({
    queryKey: ['collections', 'billing', id],
    queryFn: async () =>
      (await api.get<BillingSummary>(`/collections/billing/summary?tenantId=${id}`))
        .data,
    enabled: !!id,
  });

  const invoices = useQuery({
    queryKey: ['collections', 'invoices', id],
    queryFn: async () =>
      (await api.get<Invoice[]>(`/collections/invoices?tenantId=${id}`)).data,
    enabled: !!id,
  });

  const activateSub = useMutation({
    mutationFn: async () =>
      (
        await api.post('/collections/subscriptions/activate', {
          tenantId: id,
          packageCode,
          notes: notes || undefined,
        })
      ).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['collections'] });
      setActivateOpen(false);
    },
  });

  const generateInvoice = useMutation({
    mutationFn: async () =>
      (await api.post('/collections/invoices/generate', { tenantId: id })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['collections', 'invoices', id] });
      qc.invalidateQueries({ queryKey: ['collections', 'billing', id] });
    },
  });

  const markInvoicePaid = useMutation({
    mutationFn: async (invoiceId: string) =>
      (await api.post(`/collections/invoices/${invoiceId}/mark-paid`, {})).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['collections', 'invoices', id] });
      qc.invalidateQueries({ queryKey: ['collections', 'billing', id] });
      qc.invalidateQueries({ queryKey: ['collections', 'subscriptions'] });
    },
  });

  const invs = invoices.data ?? billing.data?.invoices ?? [];
  const sub = billing.data?.subscription;
  const name = tenant.data?.name ?? invs[0]?.tenant?.name ?? 'Company';

  const filteredInvs = useMemo(() => {
    const q = invSearch.trim().toLowerCase();
    return invs.filter((i) => {
      if (invStatus && i.status !== invStatus) return false;
      if (!q) return true;
      return `${i.packageCode} ${i.status}`.toLowerCase().includes(q);
    });
  }, [invs, invSearch, invStatus]);

  const hasFilters = invSearch.trim() !== '' || invStatus !== '';

  if (billing.isLoading || invoices.isLoading) {
    return (
      <Center>
        <Spinner />
      </Center>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            to="/companies"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink"
          >
            <ArrowLeft className="h-4 w-4" />
            Companies
          </Link>
          <div className="mt-2 flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
              <Building2 className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-ink">{name}</h1>
              <div className="mt-0.5 flex flex-wrap items-center gap-2">
                <StatusPill status={sub?.status ?? 'NONE'} />
                {sub?.packageCode ? (
                  <span className="text-sm text-muted">{sub.packageCode} package</span>
                ) : (
                  <span className="text-sm text-muted">No collections subscription</span>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => generateInvoice.mutate()}
            disabled={generateInvoice.isPending || !sub}
          >
            {generateInvoice.isPending ? 'Generating…' : 'Generate invoice'}
          </Button>
          <Button
            type="button"
            onClick={() => {
              setPackageCode(sub?.packageCode ?? billing.data?.suggestedPackage ?? 'STARTER');
              setNotes(sub?.notes ?? '');
              setActivateOpen(true);
            }}
          >
            {sub ? 'Update package' : 'Activate subscription'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Package}
          label="Active devices"
          value={billing.data?.activeDevices ?? 0}
          tone="brand"
        />
        <StatCard
          icon={Wallet}
          label="Est. monthly"
          value={money(billing.data?.estimatedMonthly ?? 0)}
          hint={billing.data?.suggestedPackage ? `Suggests ${billing.data.suggestedPackage}` : undefined}
          tone="green"
        />
        <StatCard
          icon={FileText}
          label="Open balance"
          value={money(billing.data?.openBalance ?? 0)}
          tone="amber"
        />
        <StatCard
          icon={FileText}
          label="Invoices"
          value={invs.length}
          tone="brand"
        />
      </div>

      <Card>
        <div className="border-b border-line px-5 py-4">
          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-[1.6]">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint"
                aria-hidden
              />
              <Input
                className="w-full min-w-0 pl-9"
                value={invSearch}
                onChange={(e) => setInvSearch(e.target.value)}
                placeholder="Search invoices…"
                aria-label="Search invoices"
              />
            </div>
            <Select
              className="min-w-0 flex-1"
              value={invStatus}
              onChange={(e) => setInvStatus(e.target.value)}
              aria-label="Filter by status"
            >
              <option value="">All statuses</option>
              <option value="DRAFT">DRAFT</option>
              <option value="OPEN">OPEN</option>
              <option value="PAID">PAID</option>
              <option value="PAST_DUE">PAST DUE</option>
              <option value="VOID">VOID</option>
            </Select>
            {hasFilters ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setInvSearch('');
                  setInvStatus('');
                }}
                className="shrink-0 gap-1.5 px-2.5"
              >
                <X className="h-3.5 w-3.5" />
                Clear
              </Button>
            ) : null}
          </div>
        </div>

        {filteredInvs.length === 0 ? (
          <EmptyState
            title={invs.length === 0 ? 'No collections invoices yet' : 'No matching invoices'}
            hint={
              invs.length === 0
                ? sub
                  ? 'Generate an invoice for this company to get started.'
                  : 'Activate a subscription first, then generate invoices.'
                : 'Try clearing search or filters.'
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <Table
              columns={['Package', 'Period', 'Devices', 'Total', 'Due', 'Status', '']}
            >
              {filteredInvs.map((inv) => (
                <Row key={inv.id}>
                  <td className="px-4 py-3">
                    <span className="inline-flex rounded-md bg-canvas px-2 py-0.5 text-xs font-semibold text-ink-soft">
                      {inv.packageCode}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {shortDate(inv.periodStart)} – {shortDate(inv.periodEnd)}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-muted">
                    {inv.activeDevices}
                  </td>
                  <td className="px-4 py-3 font-semibold tabular-nums text-ink">
                    {money(inv.total)}
                  </td>
                  <td className="px-4 py-3 text-muted">{shortDate(inv.dueDate)}</td>
                  <td className="px-4 py-3">
                    <StatusPill status={inv.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    {inv.status === 'OPEN' || inv.status === 'PAST_DUE' ? (
                      <Button
                        variant="secondary"
                        className="!py-1.5 !text-xs"
                        onClick={() => markInvoicePaid.mutate(inv.id)}
                        disabled={markInvoicePaid.isPending}
                      >
                        Mark paid
                      </Button>
                    ) : inv.paidAt ? (
                      <span className="text-xs text-muted">
                        Paid {shortDate(inv.paidAt)}
                      </span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                </Row>
              ))}
            </Table>
          </div>
        )}
      </Card>

      <Modal
        open={activateOpen}
        onClose={() => setActivateOpen(false)}
        title={sub ? 'Update package' : 'Activate subscription'}
        className="max-w-lg"
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            activateSub.mutate();
          }}
        >
          <p className="text-sm text-muted">
            For <span className="font-medium text-ink">{name}</span>. Device band must
            match the package.
          </p>
          {(packages.data ?? []).length > 0 ? (
            <div className="grid gap-2 sm:grid-cols-3">
              {(packages.data ?? []).map((p) => (
                <button
                  key={p.code}
                  type="button"
                  onClick={() => setPackageCode(p.code)}
                  className={`rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                    packageCode === p.code
                      ? 'border-brand-400 bg-brand-50 ring-2 ring-brand-100'
                      : 'border-line bg-canvas/60 hover:border-brand-200'
                  }`}
                >
                  <p className="font-semibold text-ink">{p.label}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {p.deviceBandMin}–{p.deviceBandMax} devices
                  </p>
                  <p className="mt-1 text-xs font-semibold tabular-nums text-ink">
                    {p.priceModel === 'PER_DEVICE'
                      ? `${money(p.unitPrice ?? 0)}/dev`
                      : `${money(p.flatPrice ?? 0)}/mo`}
                  </p>
                </button>
              ))}
            </div>
          ) : (
            <Field label="Package">
              <Select value={packageCode} onChange={(e) => setPackageCode(e.target.value)}>
                <option value="STARTER">STARTER</option>
                <option value="GROWTH">GROWTH</option>
                <option value="BUSINESS">BUSINESS</option>
              </Select>
            </Field>
          )}
          <Field label="Notes">
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional"
            />
          </Field>
          <div className="flex flex-wrap gap-2 border-t border-line pt-4">
            <Button type="submit" disabled={activateSub.isPending}>
              {activateSub.isPending ? 'Saving…' : sub ? 'Update' : 'Activate'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setActivateOpen(false)}>
              Cancel
            </Button>
          </div>
          {activateSub.isError ? (
            <p className="text-sm text-rose-600">
              Failed — check the device count matches the package band.
            </p>
          ) : null}
        </form>
      </Modal>
    </div>
  );
}
