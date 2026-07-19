import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BarChart3, Headphones, RefreshCw, UserPlus } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Pill, StatusPill } from '../components/ui/Pill';
import { Center, EmptyState, Spinner } from '../components/ui/misc';
import { Field, Input, Select } from '../components/ui/Field';
import { money, shortDate } from '../lib/format';

type CollectionCase = {
  id: string;
  tenantId: string;
  companyName: string | null;
  customerName: string | null;
  customerPhone: string | null;
  deviceImei: string | null;
  deviceModel: string | null;
  deviceStatus: string | null;
  daysOverdue: number;
  amountDue: string | number;
  currency: string;
  status: string;
  followUpCount: number;
  dueDate?: string | null;
  assignedToId?: string | null;
  assignedTo?: { id: string; fullName: string; phone?: string | null } | null;
};

type Collector = {
  id: string;
  fullName: string;
  email: string;
  role: string;
  phone?: string | null;
  isActive: boolean;
  _count?: { assignedCollectionCases: number };
};

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

export default function Collections() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const isPlatformAdmin =
    user?.role === 'SUPER_ADMIN' || user?.role === 'COLLECTIONS_ADMIN';
  const isCollector = user?.role === 'COLLECTOR';
  const isSeller =
    user?.role === 'OWNER' || user?.role === 'MANAGER' || user?.role === 'AGENT';

  const [assignCaseId, setAssignCaseId] = useState<string | null>(null);
  const [assignTo, setAssignTo] = useState('');
  const [phone, setPhone] = useState('');
  const [newStaff, setNewStaff] = useState({
    email: '',
    password: '',
    fullName: '',
    role: 'COLLECTOR',
    phone: '',
  });
  const [activate, setActivate] = useState({
    tenantId: '',
    packageCode: 'STARTER',
    notes: '',
  });

  const packages = useQuery({
    queryKey: ['collections', 'packages'],
    queryFn: async () => (await api.get<PackageDef[]>('/collections/packages')).data,
  });

  const mine = useQuery({
    queryKey: ['collections', 'cases', 'mine'],
    queryFn: async () =>
      (await api.get<CollectionCase[]>('/collections/cases/mine')).data,
    enabled: Boolean(user && (isCollector || isPlatformAdmin)),
  });

  const unassigned = useQuery({
    queryKey: ['collections', 'cases', 'unassigned'],
    queryFn: async () =>
      (await api.get<CollectionCase[]>('/collections/cases/unassigned')).data,
    enabled: Boolean(isPlatformAdmin),
  });

  const sellerCases = useQuery({
    queryKey: ['collections', 'cases', 'seller'],
    queryFn: async () => (await api.get<CollectionCase[]>('/collections/cases')).data,
    enabled: Boolean(isSeller),
  });

  const collectors = useQuery({
    queryKey: ['collections', 'collectors'],
    queryFn: async () => (await api.get<Collector[]>('/collections/collectors')).data,
    enabled: Boolean(isPlatformAdmin),
  });

  const subscriptions = useQuery({
    queryKey: ['collections', 'subscriptions'],
    queryFn: async () =>
      (await api.get<SubscriptionRow[]>('/collections/subscriptions')).data,
    enabled: Boolean(isPlatformAdmin),
  });

  const mySub = useQuery({
    queryKey: ['collections', 'subscriptions', 'me'],
    queryFn: async () => (await api.get('/collections/subscriptions/me')).data,
    enabled: Boolean(isSeller),
  });

  const tenants = useQuery({
    queryKey: ['tenants'],
    queryFn: async () => (await api.get<Tenant[]>('/tenants')).data,
    enabled: Boolean(user?.role === 'SUPER_ADMIN'),
  });

  const sync = useMutation({
    mutationFn: async () => (await api.post('/collections/sync')).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['collections'] });
    },
  });

  const assign = useMutation({
    mutationFn: async () => {
      if (!assignCaseId || !assignTo) throw new Error('Pick a collector');
      return (
        await api.post(`/collections/cases/${assignCaseId}/assign`, {
          assignedToId: assignTo,
        })
      ).data;
    },
    onSuccess: () => {
      setAssignCaseId(null);
      setAssignTo('');
      qc.invalidateQueries({ queryKey: ['collections'] });
    },
  });

  const createStaff = useMutation({
    mutationFn: async () =>
      (
        await api.post('/collections/collectors', {
          ...newStaff,
          phone: newStaff.phone || undefined,
        })
      ).data,
    onSuccess: () => {
      setNewStaff({
        email: '',
        password: '',
        fullName: '',
        role: 'COLLECTOR',
        phone: '',
      });
      qc.invalidateQueries({ queryKey: ['collections', 'collectors'] });
    },
  });

  const activateSub = useMutation({
    mutationFn: async () =>
      (await api.post('/collections/subscriptions/activate', activate)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['collections'] });
    },
  });

  const invoices = useQuery({
    queryKey: ['collections', 'invoices'],
    queryFn: async () => (await api.get('/collections/invoices')).data as Array<{
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
    }>,
    enabled: Boolean(isPlatformAdmin || isSeller),
  });

  const generateAllInvoices = useMutation({
    mutationFn: async () => (await api.post('/collections/invoices/generate-all', {})).data,
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['collections'] });
    },
  });

  const autoAssign = useMutation({
    mutationFn: async () =>
      (await api.post('/collections/cases/auto-assign', { limit: 50 })).data as {
        assigned: number;
      },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['collections'] }),
  });

  const sellerActivity = useQuery({
    queryKey: ['collections', 'activity', 'me'],
    queryFn: async () =>
      (await api.get('/collections/activity/me', { params: { days: 7 } })).data as {
        totals: { contacts: number; promises: number; collectorsActive: number };
        byCollector: Array<{
          collectorName: string;
          contacts: number;
          calls: number;
          sms: number;
          wa: number;
        }>;
        recentContacts: Array<{
          id: string;
          channel: string;
          verificationStatus: string;
          initiatedAt: string;
          collectorName: string;
          customerName: string;
          caseId: string;
        }>;
      },
    enabled: Boolean(isSeller),
  });

  const savePhone = useMutation({
    mutationFn: async () =>
      (await api.patch('/collections/me/phone', { phone })).data,
  });

  const tenantOptions = useMemo(() => {
    if (tenants.data?.length) return tenants.data;
    // Fallback: tenants from subscriptions list
    return (subscriptions.data ?? []).map((s) => s.tenant);
  }, [tenants.data, subscriptions.data]);

  if (!user) return <Center><Spinner /></Center>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-muted">
          <Headphones className="h-4 w-4" />
          Managed collections — cases always show the seller company
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/collections/reports">
            <Button variant="secondary">
              <BarChart3 className="h-4 w-4" />
              Reports
            </Button>
          </Link>
          {isPlatformAdmin ? (
            <>
              <Button
                variant="secondary"
                onClick={() => sync.mutate()}
                disabled={sync.isPending}
              >
                <RefreshCw className={`h-4 w-4 ${sync.isPending ? 'animate-spin' : ''}`} />
                Sync overdue cases
              </Button>
              <Button
                variant="secondary"
                onClick={() => autoAssign.mutate()}
                disabled={autoAssign.isPending}
              >
                {autoAssign.isPending
                  ? 'Assigning…'
                  : autoAssign.isSuccess
                    ? `Assigned ${(autoAssign.data as { assigned: number }).assigned}`
                    : 'Auto-assign queue'}
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {isSeller && sellerActivity.data ? (
        <Card>
          <CardHeader
            title="Collector activity (last 7 days)"
            subtitle="What platform collectors did on your overdue accounts"
          />
          <div className="grid gap-3 p-5 sm:grid-cols-3">
            <div className="rounded-xl bg-canvas p-4 text-sm">
              <p className="text-muted">Contacts</p>
              <p className="text-2xl font-bold tabular-nums">
                {sellerActivity.data.totals.contacts}
              </p>
            </div>
            <div className="rounded-xl bg-canvas p-4 text-sm">
              <p className="text-muted">Promises logged</p>
              <p className="text-2xl font-bold tabular-nums">
                {sellerActivity.data.totals.promises}
              </p>
            </div>
            <div className="rounded-xl bg-canvas p-4 text-sm">
              <p className="text-muted">Collectors active</p>
              <p className="text-2xl font-bold tabular-nums">
                {sellerActivity.data.totals.collectorsActive}
              </p>
            </div>
          </div>
          {(sellerActivity.data.byCollector?.length ?? 0) > 0 ? (
            <div className="space-y-2 border-t border-line px-5 py-4">
              {sellerActivity.data.byCollector.map((c) => (
                <div
                  key={c.collectorName}
                  className="flex justify-between rounded-xl bg-canvas px-4 py-2 text-sm"
                >
                  <span className="font-medium">{c.collectorName}</span>
                  <span className="text-muted">
                    {c.contacts} contacts · {c.calls} call · {c.sms} sms · {c.wa} wa
                  </span>
                </div>
              ))}
            </div>
          ) : null}
          {(sellerActivity.data.recentContacts?.length ?? 0) > 0 ? (
            <div className="max-h-64 space-y-2 overflow-y-auto border-t border-line p-5">
              {sellerActivity.data.recentContacts.map((c) => (
                <div
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-2 text-sm"
                >
                  <div>
                    <Link
                      to={`/collections/cases/${c.caseId}`}
                      className="font-medium text-brand-700 hover:underline"
                    >
                      {c.customerName}
                    </Link>
                    <p className="text-xs text-muted">
                      {c.collectorName} · {c.channel} · {shortDate(c.initiatedAt)}
                    </p>
                  </div>
                  <StatusPill status={c.verificationStatus} />
                </div>
              ))}
            </div>
          ) : (
            <div className="border-t border-line p-5">
              <EmptyState title="No collector contacts this week yet" />
            </div>
          )}
        </Card>
      ) : null}

      {/* Packages */}
      <Card>
        <CardHeader
          title="Collections packages"
          subtitle="Sellers subscribe so platform collectors can follow up"
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

      {/* Seller subscription status */}
      {isSeller && mySub.data ? (
        <Card className="p-5">
          <p className="text-sm font-medium text-muted">Your collections service</p>
          <p className="mt-1 text-lg font-semibold">
            {mySub.data.subscription
              ? `${mySub.data.subscription.packageCode} · ${mySub.data.subscription.status}`
              : 'Not subscribed'}
          </p>
          <p className="mt-1 text-sm text-muted">
            Active devices: {mySub.data.activeDevices}
            {mySub.data.suggestedPackage
              ? ` · Suggested package: ${mySub.data.suggestedPackage}`
              : ''}
          </p>
        </Card>
      ) : null}

      {/* Activate subscription (platform) */}
      {isPlatformAdmin ? (
        <Card>
          <CardHeader title="Activate seller subscription" />
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
                onChange={(e) =>
                  setActivate({ ...activate, tenantId: e.target.value })
                }
                required
              >
                <option value="">Select tenant…</option>
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
                onChange={(e) =>
                  setActivate({ ...activate, packageCode: e.target.value })
                }
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
                onChange={(e) =>
                  setActivate({ ...activate, notes: e.target.value })
                }
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
                Activation failed — check device count matches package band.
              </p>
            ) : null}
            {activateSub.isSuccess ? (
              <p className="text-sm text-emerald-700 md:col-span-4">
                Activated. Cases synced:{' '}
                {(activateSub.data as { casesSynced?: number })?.casesSynced ?? 0}
              </p>
            ) : null}
          </form>
        </Card>
      ) : null}

      {/* Subscriptions list */}
      {isPlatformAdmin && (subscriptions.data?.length ?? 0) > 0 ? (
        <Card>
          <CardHeader title="Active subscriptions" />
          <div className="divide-y divide-line px-2 pb-2">
            {subscriptions.data!.map((s) => (
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
        </Card>
      ) : null}

      {/* Collections package invoices */}
      {(isPlatformAdmin || isSeller) && (
        <Card>
          <CardHeader
            title="Collections invoices"
            subtitle="Managed follow-up packages (separate from platform SaaS billing)"
            action={
              isPlatformAdmin ? (
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
              ) : undefined
            }
          />
          {!invoices.data?.length ? (
            <div className="p-5">
              <EmptyState
                title="No collections invoices yet"
                hint={
                  isPlatformAdmin
                    ? 'Activate subscriptions, then generate this month.'
                    : 'Your platform admin will generate invoices when due.'
                }
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
                    {isPlatformAdmin &&
                    (inv.status === 'OPEN' || inv.status === 'PAST_DUE') ? (
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
      )}

      {/* Collectors + phone */}
      {isPlatformAdmin ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title="Collectors" subtitle="Platform staff who follow up" />
            <div className="space-y-2 p-5">
              {(collectors.data ?? []).length === 0 ? (
                <EmptyState title="No collectors yet" hint="Create one on the right." />
              ) : (
                collectors.data!.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between rounded-xl bg-canvas px-4 py-3 text-sm"
                  >
                    <div>
                      <p className="font-semibold">{c.fullName}</p>
                      <p className="text-xs text-muted">
                        {c.role} · {c.phone || 'No phone'} · open cases{' '}
                        {c._count?.assignedCollectionCases ?? 0}
                      </p>
                    </div>
                    <Pill tone={c.isActive ? 'green' : 'gray'}>
                      {c.isActive ? 'Active' : 'Off'}
                    </Pill>
                  </div>
                ))
              )}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Add platform staff"
              subtitle="COLLECTOR or COLLECTIONS_ADMIN"
            />
            <form
              className="space-y-3 p-5"
              onSubmit={(e) => {
                e.preventDefault();
                createStaff.mutate();
              }}
            >
              <Field label="Full name">
                <Input
                  value={newStaff.fullName}
                  onChange={(e) =>
                    setNewStaff({ ...newStaff, fullName: e.target.value })
                  }
                  required
                />
              </Field>
              <Field label="Email">
                <Input
                  type="email"
                  value={newStaff.email}
                  onChange={(e) =>
                    setNewStaff({ ...newStaff, email: e.target.value })
                  }
                  required
                />
              </Field>
              <Field label="Password">
                <Input
                  type="password"
                  value={newStaff.password}
                  onChange={(e) =>
                    setNewStaff({ ...newStaff, password: e.target.value })
                  }
                  required
                  minLength={8}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Role">
                  <Select
                    value={newStaff.role}
                    onChange={(e) =>
                      setNewStaff({ ...newStaff, role: e.target.value })
                    }
                  >
                    <option value="COLLECTOR">COLLECTOR</option>
                    {user?.role === 'SUPER_ADMIN' ? (
                      <option value="COLLECTIONS_ADMIN">COLLECTIONS_ADMIN</option>
                    ) : null}
                  </Select>
                </Field>
                <Field label="Follow-up phone">
                  <Input
                    value={newStaff.phone}
                    onChange={(e) =>
                      setNewStaff({ ...newStaff, phone: e.target.value })
                    }
                    placeholder="+255…"
                  />
                </Field>
              </div>
              <Button type="submit" disabled={createStaff.isPending}>
                <UserPlus className="h-4 w-4" />
                {createStaff.isPending ? 'Creating…' : 'Create'}
              </Button>
            </form>
          </Card>
        </div>
      ) : null}

      {(isCollector || isPlatformAdmin) && (
        <Card className="p-5">
          <p className="text-sm font-medium">Your follow-up phone</p>
          <p className="mt-0.5 text-xs text-muted">
            Used for system-initiated calls/SMS (BYOD). Required for verified contact later.
          </p>
          <form
            className="mt-3 flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              savePhone.mutate();
            }}
          >
            <Input
              className="max-w-xs"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+2557…"
              required
            />
            <Button type="submit" variant="secondary" disabled={savePhone.isPending}>
              Save phone
            </Button>
            {savePhone.isSuccess ? (
              <span className="self-center text-sm text-emerald-700">Saved</span>
            ) : null}
          </form>
        </Card>
      )}

      {/* Unassigned queue */}
      {isPlatformAdmin ? (
        <CaseList
          title="Unassigned work queue"
          subtitle="Assign to a collector — company column always visible"
          rows={unassigned.data}
          loading={unassigned.isLoading}
          empty="No unassigned cases. Activate a subscription and sync."
          showCompany
          actionLabel="Assign"
          onAction={(id) => {
            setAssignCaseId(id);
            setAssignTo(collectors.data?.[0]?.id ?? '');
          }}
        />
      ) : null}

      {/* My queue */}
      {(isCollector || isPlatformAdmin) && (
        <CaseList
          title="My queue"
          subtitle="Cases assigned to you"
          rows={mine.data}
          loading={mine.isLoading}
          empty="No cases assigned to you yet."
          showCompany
        />
      )}

      {/* Seller view */}
      {isSeller ? (
        <CaseList
          title="Your collection cases"
          subtitle="Overdue accounts in managed collections (read-only for sellers)"
          rows={sellerCases.data}
          loading={sellerCases.isLoading}
          empty="No managed cases for your company yet."
          showCompany={false}
        />
      ) : null}

      {/* Assign modal-ish panel */}
      {assignCaseId && isPlatformAdmin ? (
        <Card className="border-brand-200 p-5">
          <p className="font-semibold">Assign case</p>
          <p className="text-xs text-muted">Case id: {assignCaseId}</p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <Field label="Collector">
              <Select
                value={assignTo}
                onChange={(e) => setAssignTo(e.target.value)}
              >
                <option value="">Select…</option>
                {(collectors.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.fullName} ({c.role})
                  </option>
                ))}
              </Select>
            </Field>
            <Button onClick={() => assign.mutate()} disabled={assign.isPending}>
              {assign.isPending ? 'Assigning…' : 'Confirm assign'}
            </Button>
            <Button variant="ghost" onClick={() => setAssignCaseId(null)}>
              Cancel
            </Button>
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function CaseList({
  title,
  subtitle,
  rows,
  loading,
  empty,
  showCompany,
  actionLabel,
  onAction,
}: {
  title: string;
  subtitle: string;
  rows?: CollectionCase[];
  loading: boolean;
  empty: string;
  showCompany: boolean;
  actionLabel?: string;
  onAction?: (id: string) => void;
}) {
  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} />
      {loading ? (
        <Center><Spinner /></Center>
      ) : !rows || rows.length === 0 ? (
        <div className="p-5">
          <EmptyState title={empty} />
        </div>
      ) : (
        <div className="overflow-x-auto px-2 pb-3">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted">
                {showCompany ? <th className="px-3 py-2 font-medium">Company</th> : null}
                <th className="px-3 py-2 font-medium">Customer</th>
                <th className="px-3 py-2 font-medium">Device</th>
                <th className="px-3 py-2 font-medium">Days</th>
                <th className="px-3 py-2 font-medium">Due</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium text-right">Amount</th>
                {actionLabel ? <th className="px-3 py-2 font-medium" /> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-line hover:bg-canvas/40">
                  {showCompany ? (
                    <td className="px-3 py-3 font-medium">{r.companyName ?? '—'}</td>
                  ) : null}
                  <td className="px-3 py-3">
                    <Link
                      to={`/collections/cases/${r.id}`}
                      className="font-medium text-brand-700 hover:underline"
                    >
                      {r.customerName}
                    </Link>
                    <p className="text-xs text-muted">{r.customerPhone}</p>
                  </td>
                  <td className="px-3 py-3 text-muted">
                    <p>{r.deviceImei}</p>
                    <p className="text-xs">{r.deviceModel}</p>
                  </td>
                  <td className="px-3 py-3 tabular-nums">{r.daysOverdue}</td>
                  <td className="px-3 py-3 text-muted tabular-nums">
                    {r.dueDate ? shortDate(r.dueDate) : '—'}
                  </td>
                  <td className="px-3 py-3">
                    <StatusPill status={r.status} />
                  </td>
                  <td className="px-3 py-3 text-right font-semibold tabular-nums">
                    {money(r.amountDue)}
                  </td>
                  {actionLabel && onAction ? (
                    <td className="px-3 py-3 text-right">
                      <Button
                        variant="secondary"
                        className="!py-1.5 !text-xs"
                        onClick={() => onAction(r.id)}
                      >
                        {actionLabel}
                      </Button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
