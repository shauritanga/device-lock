import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  CheckCircle2,
  Inbox,
  Phone,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { api } from '@/shared/api/client';
import { useAuth } from '@/shared/auth/AuthContext';
import { StatCard } from '@/shared/components/StatCard';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Table, Row } from '@/shared/components/ui/Table';
import { StatusPill } from '@/shared/components/ui/Pill';
import { EmptyState, Center, Spinner } from '@/shared/components/ui/misc';
import { Modal } from '@/shared/components/ui/Modal';
import { Field, Input, Select } from '@/shared/components/ui/Field';
import { shortDate } from '@/shared/lib/format';
import { cn } from '@/shared/lib/cn';

type DemoRequest = {
  id: string;
  fullName: string;
  companyName: string;
  phone: string;
  email?: string | null;
  devicesPerMonth?: string | null;
  suggestedPackage?: string | null;
  message?: string | null;
  status: string;
  adminNotes?: string | null;
  convertedTenantId?: string | null;
  convertedTenant?: { id: string; name: string; isActive: boolean } | null;
  source: string;
  createdAt: string;
  contactedAt?: string | null;
};

const STATUSES = ['NEW', 'CONTACTED', 'QUALIFIED', 'CONVERTED', 'CLOSED'] as const;
const PACKAGES = ['STARTER', 'GROWTH', 'BUSINESS', 'ENTERPRISE'] as const;

function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function isThisMonth(iso: string) {
  return new Date(iso) >= startOfMonth();
}

/**
 * Sales inbox for marketing-site demo leads: stats, search/filters, table,
 * and a detail modal to triage or convert into a seller Tenant.
 */
export default function DemoRequests() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [packageFilter, setPackageFilter] = useState('');
  const [periodFilter, setPeriodFilter] = useState<'all' | 'month' | 'week'>('all');

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [nextStatus, setNextStatus] = useState('CONTACTED');
  const [leadEmail, setLeadEmail] = useState('');
  const [convertResult, setConvertResult] = useState<{
    email: string;
    temporaryPassword: string;
    portalUrl: string;
    emailSent: boolean;
  } | null>(null);

  const list = useQuery({
    queryKey: ['demo-requests'],
    queryFn: async () => (await api.get<DemoRequest[]>('/demo-requests')).data,
  });

  const rows = list.data ?? [];

  const stats = useMemo(() => {
    const newCount = rows.filter((r) => r.status === 'NEW').length;
    const pipeline = rows.filter((r) =>
      ['CONTACTED', 'QUALIFIED'].includes(r.status),
    ).length;
    const convertedMonth = rows.filter(
      (r) => r.status === 'CONVERTED' && isThisMonth(r.createdAt),
    ).length;
    return {
      total: rows.length,
      newCount,
      pipeline,
      convertedMonth,
    };
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    return rows.filter((r) => {
      if (statusFilter && r.status !== statusFilter) return false;
      if (packageFilter && r.suggestedPackage !== packageFilter) return false;
      if (periodFilter === 'month' && !isThisMonth(r.createdAt)) return false;
      if (periodFilter === 'week' && new Date(r.createdAt).getTime() < weekAgo) {
        return false;
      }
      if (!q) return true;
      const hay = [
        r.companyName,
        r.fullName,
        r.phone,
        r.email,
        r.message,
        r.suggestedPackage,
        r.devicesPerMonth,
        r.adminNotes,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search, statusFilter, packageFilter, periodFilter]);

  const selected = useMemo(
    () => rows.find((r) => r.id === selectedId) ?? null,
    [rows, selectedId],
  );

  const update = useMutation({
    mutationFn: async () => {
      if (!selectedId) return;
      return (
        await api.patch(`/demo-requests/${selectedId}`, {
          status: nextStatus,
          adminNotes: notes || undefined,
          email: leadEmail.trim() || undefined,
        })
      ).data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['demo-requests'] }),
  });

  const convert = useMutation({
    mutationFn: async () => {
      if (!selectedId) return;
      return (
        await api.post(`/demo-requests/${selectedId}/convert`, {
          ownerEmail: leadEmail.trim() || undefined,
        })
      ).data as DemoRequest & {
        ownerAccount?: {
          email: string;
          temporaryPassword: string;
          portalUrl: string;
          emailSent: boolean;
        };
      };
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['demo-requests'] });
      qc.invalidateQueries({ queryKey: ['tenants'] });
      qc.invalidateQueries({ queryKey: ['collections'] });
      if (data?.ownerAccount) setConvertResult(data.ownerAccount);
    },
  });

  function openLead(row: DemoRequest) {
    setSelectedId(row.id);
    setNotes(row.adminNotes ?? '');
    setLeadEmail(row.email ?? '');
    setConvertResult(null);
    convert.reset();
    setNextStatus(
      row.status === 'NEW'
        ? 'CONTACTED'
        : row.status === 'CONTACTED'
          ? 'QUALIFIED'
          : row.status,
    );
  }

  function clearFilters() {
    setSearch('');
    setStatusFilter('');
    setPackageFilter('');
    setPeriodFilter('all');
  }

  const hasFilters =
    search.trim() !== '' ||
    statusFilter !== '' ||
    packageFilter !== '' ||
    periodFilter !== 'all';

  if (list.isLoading) {
    return (
      <Center>
        <Spinner />
      </Center>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-ink">Demo requests</h1>
        <p className="mt-0.5 text-sm text-muted">
          Inbound leads from linda.co.tz — triage, follow up, and convert to seller companies.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Inbox} label="Total leads" value={stats.total} tone="brand" />
        <StatCard
          icon={Sparkles}
          label="New"
          value={stats.newCount}
          hint="Awaiting first contact"
          tone="amber"
        />
        <StatCard
          icon={Phone}
          label="In pipeline"
          value={stats.pipeline}
          hint="Contacted / qualified"
          tone="brand"
        />
        <StatCard
          icon={CheckCircle2}
          label="Converted this month"
          value={stats.convertedMonth}
          tone="green"
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
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search…"
                aria-label="Search demo requests"
              />
            </div>
            <Select
              className="min-w-0 flex-1"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter by status"
            >
              <option value="">All statuses</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, ' ')}
                </option>
              ))}
            </Select>
            <Select
              className="min-w-0 flex-1"
              value={packageFilter}
              onChange={(e) => setPackageFilter(e.target.value)}
              aria-label="Filter by package"
            >
              <option value="">All packages</option>
              {PACKAGES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
            <Select
              className="min-w-0 flex-1"
              value={periodFilter}
              onChange={(e) =>
                setPeriodFilter(e.target.value as 'all' | 'month' | 'week')
              }
              aria-label="Filter by period"
            >
              <option value="all">Any time</option>
              <option value="week">Last 7 days</option>
              <option value="month">This month</option>
            </Select>
            {hasFilters ? (
              <Button
                type="button"
                variant="ghost"
                onClick={clearFilters}
                className="shrink-0 gap-1.5 px-2.5"
              >
                <X className="h-3.5 w-3.5" />
                Clear
              </Button>
            ) : null}
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            title={rows.length === 0 ? 'No demo requests yet' : 'No matching leads'}
            hint={
              rows.length === 0
                ? 'When a dealer submits the website form, it will show up here.'
                : 'Try clearing search or filters.'
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <Table
              columns={[
                'Company',
                'Contact',
                'Phone',
                'Package',
                'Volume',
                'Status',
                'Submitted',
              ]}
            >
              {filtered.map((row) => (
                <Row key={row.id} onClick={() => openLead(row)}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-canvas text-muted">
                        <Building2 className="h-3.5 w-3.5" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-ink">{row.companyName}</p>
                        {row.message ? (
                          <p className="mt-0.5 max-w-[220px] truncate text-xs text-faint">
                            {row.message}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-ink">{row.fullName}</td>
                  <td className="px-4 py-3">
                    <a
                      href={`tel:${row.phone}`}
                      className="font-medium text-brand-700 hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {row.phone}
                    </a>
                  </td>
                  <td className="px-4 py-3">
                    {row.suggestedPackage ? (
                      <span className="inline-flex rounded-md bg-canvas px-2 py-0.5 text-xs font-semibold text-ink-soft">
                        {row.suggestedPackage}
                      </span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {row.devicesPerMonth ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={row.status} />
                  </td>
                  <td className="px-4 py-3 text-right text-muted">
                    {shortDate(row.createdAt)}
                  </td>
                </Row>
              ))}
            </Table>
          </div>
        )}
      </Card>

      <Modal
        open={!!selected}
        onClose={() => setSelectedId(null)}
        title={selected?.companyName ?? 'Lead'}
        className="max-w-xl"
      >
        {selected ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm text-muted">
                  {selected.fullName}
                  {selected.email ? ` · ${selected.email}` : ''}
                </p>
                <a
                  href={`tel:${selected.phone}`}
                  className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline"
                >
                  <Phone className="h-3.5 w-3.5" />
                  {selected.phone}
                </a>
              </div>
              <StatusPill status={selected.status} />
            </div>

            {selected.message ? (
              <div className="rounded-xl bg-canvas px-4 py-3">
                <p className="text-2xs font-semibold uppercase tracking-wider text-muted">
                  Message
                </p>
                <p className="mt-1 text-sm leading-relaxed text-ink">{selected.message}</p>
              </div>
            ) : null}

            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl border border-line px-3 py-2.5">
                <dt className="text-2xs font-semibold uppercase tracking-wider text-muted">
                  Package hint
                </dt>
                <dd className="mt-0.5 font-medium text-ink">
                  {selected.suggestedPackage ?? '—'}
                </dd>
              </div>
              <div className="rounded-xl border border-line px-3 py-2.5">
                <dt className="text-2xs font-semibold uppercase tracking-wider text-muted">
                  Devices / month
                </dt>
                <dd className="mt-0.5 font-medium text-ink">
                  {selected.devicesPerMonth ?? '—'}
                </dd>
              </div>
              <div className="rounded-xl border border-line px-3 py-2.5">
                <dt className="text-2xs font-semibold uppercase tracking-wider text-muted">
                  Submitted
                </dt>
                <dd className="mt-0.5 font-medium text-ink">
                  {shortDate(selected.createdAt)}
                </dd>
              </div>
              <div className="rounded-xl border border-line px-3 py-2.5">
                <dt className="text-2xs font-semibold uppercase tracking-wider text-muted">
                  Source
                </dt>
                <dd className="mt-0.5 font-medium text-ink">{selected.source}</dd>
              </div>
              {selected.convertedTenant ? (
                <div className="col-span-2 rounded-xl border border-emerald-200 bg-emerald-50/60 px-3 py-2.5">
                  <dt className="text-2xs font-semibold uppercase tracking-wider text-emerald-700">
                    Converted company
                  </dt>
                  <dd className="mt-0.5 font-medium text-emerald-900">
                    {selected.convertedTenant.name}
                  </dd>
                </div>
              ) : null}
            </dl>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Status">
                <Select
                  value={nextStatus}
                  onChange={(e) => setNextStatus(e.target.value)}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s.replace(/_/g, ' ')}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Work email (portal login)">
                <Input
                  type="email"
                  value={leadEmail}
                  onChange={(e) => setLeadEmail(e.target.value)}
                  placeholder="owner@company.tz"
                />
              </Field>
            </div>
            <Field label="Admin notes">
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Call outcome, preferred time…"
              />
            </Field>

            <div className="flex flex-wrap gap-2 border-t border-line pt-4">
              <Button
                type="button"
                onClick={() => update.mutate()}
                disabled={update.isPending}
              >
                {update.isPending ? 'Saving…' : 'Save changes'}
              </Button>
              {isSuperAdmin &&
              selected.status !== 'CONVERTED' &&
              selected.status !== 'CLOSED' ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    if (!leadEmail.trim()) {
                      alert(
                        'Add a work email first — it becomes the client portal login.',
                      );
                      return;
                    }
                    if (
                      confirm(
                        `Create “${selected.companyName}”, OWNER login for ${leadEmail.trim()}, and email welcome credentials?`,
                      )
                    ) {
                      convert.mutate();
                    }
                  }}
                  disabled={convert.isPending}
                >
                  {convert.isPending ? 'Converting…' : 'Convert to company'}
                </Button>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                className={cn('ml-auto')}
                onClick={() => setSelectedId(null)}
              >
                Close
              </Button>
            </div>

            {update.isError || convert.isError ? (
              <p className="text-sm text-rose-600">
                {(() => {
                  const err = (convert.error || update.error) as {
                    response?: { data?: { message?: string | string[] } };
                  } | null;
                  const msg = err?.response?.data?.message;
                  if (Array.isArray(msg)) return msg.join(' ');
                  if (typeof msg === 'string') return msg;
                  return 'Could not save. Try again.';
                })()}
              </p>
            ) : null}
            {convertResult ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-900">
                <p className="font-semibold">
                  Company created
                  {convertResult.emailSent
                    ? ' — welcome email sent.'
                    : ' — email not delivered; share these credentials manually.'}
                </p>
                <dl className="mt-2 space-y-1 font-mono text-xs">
                  <div>
                    <span className="text-emerald-700">Portal: </span>
                    <a
                      href={convertResult.portalUrl}
                      className="underline"
                      target="_blank"
                      rel="noreferrer"
                    >
                      {convertResult.portalUrl}
                    </a>
                  </div>
                  <div>
                    <span className="text-emerald-700">Email: </span>
                    {convertResult.email}
                  </div>
                  <div>
                    <span className="text-emerald-700">Password: </span>
                    {convertResult.temporaryPassword}
                  </div>
                </dl>
                <p className="mt-2 text-xs text-emerald-800">
                  Shown once here. Ask the client to change the password after first login.
                </p>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
