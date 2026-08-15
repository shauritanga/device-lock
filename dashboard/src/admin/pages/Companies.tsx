import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, FileText, Package, Search, Wallet, X } from 'lucide-react';
import { api } from '@/shared/api/client';
import { StatCard } from '@/shared/components/StatCard';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Table, Row } from '@/shared/components/ui/Table';
import { StatusPill } from '@/shared/components/ui/Pill';
import { EmptyState, Center, Spinner } from '@/shared/components/ui/misc';
import { Modal } from '@/shared/components/ui/Modal';
import { Field, Input, Select } from '@/shared/components/ui/Field';
import { money } from '@/shared/lib/format';

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
  tenant: { id: string; name: string; isActive?: boolean };
};

type Tenant = {
  id: string;
  name: string;
  isActive?: boolean;
  billingPlan?: string;
};

type CompanyRow = {
  tenantId: string;
  name: string;
  isActive: boolean;
  packageCode?: string;
  status: string;
  activeDevices?: number;
  estimatedMonthly?: number;
};

/**
 * Company directory. Invoices and per-company subscription work live on
 * /companies/:id.
 */
export default function Companies() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [activateOpen, setActivateOpen] = useState(false);
  const [activate, setActivate] = useState({
    tenantId: '',
    packageCode: 'STARTER',
    notes: '',
  });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [packageFilter, setPackageFilter] = useState('');

  const packages = useQuery({
    queryKey: ['collections', 'packages'],
    queryFn: async () => (await api.get<PackageDef[]>('/collections/packages')).data,
  });

  const tenants = useQuery({
    queryKey: ['tenants'],
    queryFn: async () => (await api.get<Tenant[]>('/tenants')).data,
    retry: false,
  });

  const subscriptions = useQuery({
    queryKey: ['collections', 'subscriptions'],
    queryFn: async () =>
      (await api.get<SubscriptionRow[]>('/collections/subscriptions')).data,
  });

  const activateSub = useMutation({
    mutationFn: async () =>
      (await api.post('/collections/subscriptions/activate', activate)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['collections'] });
      setActivateOpen(false);
      setActivate({ tenantId: '', packageCode: 'STARTER', notes: '' });
    },
  });

  const processPastDue = useMutation({
    mutationFn: async () =>
      (await api.post('/collections/invoices/process-past-due')).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['collections'] }),
  });

  const rows = useMemo<CompanyRow[]>(() => {
    const subs = subscriptions.data ?? [];
    const byTenant = new Map(subs.map((s) => [s.tenantId, s]));

    if (tenants.data?.length) {
      return tenants.data.map((t) => {
        const s = byTenant.get(t.id);
        return {
          tenantId: t.id,
          name: t.name,
          isActive: t.isActive !== false,
          packageCode: s?.packageCode ?? t.billingPlan,
          status: s?.status ?? 'NONE',
          activeDevices: s?.activeDevices ?? 0,
          estimatedMonthly: s?.estimatedMonthly ?? 0,
        };
      });
    }

    return subs.map((s) => ({
      tenantId: s.tenantId,
      name: s.tenant.name,
      isActive: s.tenant.isActive !== false,
      packageCode: s.packageCode,
      status: s.status,
      activeDevices: s.activeDevices,
      estimatedMonthly: s.estimatedMonthly,
    }));
  }, [tenants.data, subscriptions.data]);

  const stats = useMemo(() => {
    const subscribed = rows.filter((r) => r.status !== 'NONE').length;
    const active = rows.filter((r) => r.status === 'ACTIVE').length;
    const none = rows.filter((r) => r.status === 'NONE').length;
    const estimatedMrr = rows
      .filter((r) => r.status === 'ACTIVE')
      .reduce((sum, r) => sum + Number(r.estimatedMonthly ?? 0), 0);
    return { total: rows.length, subscribed, active, none, estimatedMrr };
  }, [rows]);

  const packageCodes = useMemo(() => {
    const fromPkgs = (packages.data ?? []).map((p) => p.code);
    if (fromPkgs.length) return fromPkgs;
    return [...new Set(rows.map((r) => r.packageCode).filter(Boolean) as string[])];
  }, [packages.data, rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter && r.status !== statusFilter) return false;
      if (packageFilter && r.packageCode !== packageFilter) return false;
      if (!q) return true;
      return `${r.name} ${r.packageCode ?? ''} ${r.status}`.toLowerCase().includes(q);
    });
  }, [rows, search, statusFilter, packageFilter]);

  const hasFilters =
    search.trim() !== '' || statusFilter !== '' || packageFilter !== '';

  const tenantOptions = useMemo(() => {
    if (tenants.data?.length) return tenants.data;
    return (subscriptions.data ?? []).map((s) => s.tenant);
  }, [tenants.data, subscriptions.data]);

  if (subscriptions.isLoading || tenants.isLoading) {
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
          <h1 className="hidden text-xl font-bold tracking-tight text-ink md:block">Companies</h1>
          <p className="mt-0.5 text-sm text-muted">
            Seller companies. Open one to manage its subscription and invoices.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => processPastDue.mutate()}
            disabled={processPastDue.isPending}
          >
            Process past due
          </Button>
          <Button type="button" onClick={() => setActivateOpen(true)}>
            Activate subscription
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Building2} label="Companies" value={stats.total} tone="brand" />
        <StatCard
          icon={Package}
          label="Active"
          value={stats.active}
          hint="Collections follow-up"
          tone="green"
        />
        <StatCard
          icon={FileText}
          label="Not subscribed"
          value={stats.none}
          tone="amber"
        />
        <StatCard
          icon={Wallet}
          label="Est. monthly"
          value={money(stats.estimatedMrr)}
          tone="brand"
        />
      </div>

      <Card>
        <div className="border-b border-line px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="relative w-full min-w-0 sm:min-w-[12rem] sm:flex-[1.6]">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint"
                aria-hidden
              />
              <Input
                className="w-full min-w-0 pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search…"
                aria-label="Search companies"
              />
            </div>
            <Select
              className="w-full min-w-0 sm:w-auto sm:min-w-[9rem] sm:flex-1"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter by status"
            >
              <option value="">All statuses</option>
              <option value="ACTIVE">ACTIVE</option>
              <option value="PENDING">PENDING</option>
              <option value="PAST_DUE">PAST DUE</option>
              <option value="SUSPENDED">SUSPENDED</option>
              <option value="NONE">NONE</option>
            </Select>
            <Select
              className="w-full min-w-0 sm:w-auto sm:min-w-[9rem] sm:flex-1"
              value={packageFilter}
              onChange={(e) => setPackageFilter(e.target.value)}
              aria-label="Filter by package"
            >
              <option value="">All packages</option>
              {packageCodes.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
            {hasFilters ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setSearch('');
                  setStatusFilter('');
                  setPackageFilter('');
                }}
                className="w-full shrink-0 gap-1.5 px-2.5 sm:w-auto"
              >
                <X className="h-3.5 w-3.5" />
                Clear
              </Button>
            ) : null}
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            title={rows.length === 0 ? 'No companies yet' : 'No matching companies'}
            hint={
              rows.length === 0
                ? 'Convert a demo lead or create a tenant to see companies here.'
                : 'Try clearing search or filters.'
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <Table
              columns={['Company', 'Package', 'Devices', 'Est. monthly', 'Status']}
            >
              {filtered.map((r) => (
                <Row
                  key={r.tenantId}
                  onClick={() => navigate(`/companies/${r.tenantId}`)}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-canvas text-muted">
                        <Building2 className="h-3.5 w-3.5" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-ink">{r.name}</p>
                        {!r.isActive ? (
                          <p className="text-xs text-rose-600">Inactive</p>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {r.packageCode ? (
                      <span className="inline-flex rounded-md bg-canvas px-2 py-0.5 text-xs font-semibold text-ink-soft">
                        {r.packageCode}
                      </span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-muted">
                    {r.activeDevices ?? 0}
                  </td>
                  <td className="px-4 py-3 font-medium tabular-nums text-ink">
                    {r.status === 'NONE' && !r.packageCode
                      ? '—'
                      : money(r.estimatedMonthly ?? 0)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <StatusPill status={r.status} />
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
        title="Activate subscription"
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
            Or open a company and activate from its page. Bands are validated against
            active financed devices.
          </p>
          {(packages.data ?? []).length > 0 ? (
            <div className="grid gap-2 sm:grid-cols-3">
              {(packages.data ?? []).map((p) => (
                <button
                  key={p.code}
                  type="button"
                  onClick={() => setActivate({ ...activate, packageCode: p.code })}
                  className={`rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                    activate.packageCode === p.code
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
          ) : null}
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
          <Field label="Notes">
            <Input
              value={activate.notes}
              onChange={(e) => setActivate({ ...activate, notes: e.target.value })}
              placeholder="Optional"
            />
          </Field>
          <div className="flex flex-wrap gap-2 border-t border-line pt-4">
            <Button type="submit" disabled={activateSub.isPending || !activate.tenantId}>
              {activateSub.isPending ? 'Activating…' : 'Activate'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setActivateOpen(false)}>
              Cancel
            </Button>
          </div>
          {activateSub.isError ? (
            <p className="text-sm text-rose-600">
              Activation failed — check the device count matches the package band.
            </p>
          ) : null}
        </form>
      </Modal>
    </div>
  );
}
