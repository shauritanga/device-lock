import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Briefcase,
  Eye,
  EyeOff,
  Phone,
  Search,
  UserCheck,
  UserCog,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { api } from '@/shared/api/client';
import { useAuth } from '@/shared/auth/AuthContext';
import { PLATFORM_ADMIN_ROLES, STAFFING_ADMIN_ROLES, roleAllowed } from '@/shared/auth/roles';
import { StatCard } from '@/shared/components/StatCard';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Table, Row } from '@/shared/components/ui/Table';
import { StatusPill } from '@/shared/components/ui/Pill';
import { EmptyState, Center, Spinner } from '@/shared/components/ui/misc';
import { Modal } from '@/shared/components/ui/Modal';
import { Field, Input, Select } from '@/shared/components/ui/Field';

type Collector = {
  id: string;
  fullName: string;
  email: string;
  role: string;
  phone?: string | null;
  isActive: boolean;
  managedById?: string | null;
  managedBy?: { id: string; fullName: string; email: string } | null;
  _count?: {
    assignedCollectionCases: number;
    managedCollectors?: number;
  };
};

const emptyForm = {
  email: '',
  password: '',
  fullName: '',
  role: 'COLLECTOR',
  phone: '',
  managedById: '',
};

/**
 * Platform collectors staffing with MASTER_COLLECTOR team assignment.
 */
export default function Collectors() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const canStaff = roleAllowed(user?.role, STAFFING_ADMIN_ROLES);
  const isPlatformAdmin = roleAllowed(user?.role, PLATFORM_ADMIN_ROLES);
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const isMaster = user?.role === 'MASTER_COLLECTOR';

  const [phone, setPhone] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignTarget, setAssignTarget] = useState<Collector | null>(null);
  const [assignMasterId, setAssignMasterId] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [newStaff, setNewStaff] = useState(emptyForm);

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [masterFilter, setMasterFilter] = useState('');

  const collectors = useQuery({
    queryKey: ['collections', 'collectors'],
    queryFn: async () => (await api.get<Collector[]>('/collections/collectors')).data,
    enabled: canStaff,
  });

  useEffect(() => {
    const self = (collectors.data ?? []).find((c) => c.id === user?.userId);
    if (self?.phone) setPhone(self.phone);
  }, [collectors.data, user?.userId]);

  const createStaff = useMutation({
    mutationFn: async () =>
      (
        await api.post('/collections/collectors', {
          email: newStaff.email,
          password: newStaff.password,
          fullName: newStaff.fullName,
          role: newStaff.role,
          phone: newStaff.phone || undefined,
          managedById:
            newStaff.role === 'COLLECTOR' && newStaff.managedById
              ? newStaff.managedById
              : undefined,
        })
      ).data,
    onSuccess: () => {
      setNewStaff(emptyForm);
      setShowPassword(false);
      setCreateOpen(false);
      qc.invalidateQueries({ queryKey: ['collections', 'collectors'] });
    },
  });

  const assignMaster = useMutation({
    mutationFn: async () => {
      if (!assignTarget) return;
      return (
        await api.patch(`/collections/collectors/${assignTarget.id}/master`, {
          masterCollectorId: assignMasterId || null,
        })
      ).data;
    },
    onSuccess: () => {
      setAssignOpen(false);
      setAssignTarget(null);
      setAssignMasterId('');
      qc.invalidateQueries({ queryKey: ['collections', 'collectors'] });
    },
  });

  const savePhone = useMutation({
    mutationFn: async () => (await api.patch('/collections/me/phone', { phone })).data,
  });

  const rows = collectors.data ?? [];
  const masters = useMemo(
    () => rows.filter((r) => r.role === 'MASTER_COLLECTOR' && r.isActive),
    [rows],
  );

  const stats = useMemo(() => {
    const collectorsOnly = rows.filter((r) => r.role === 'COLLECTOR');
    const masterCount = rows.filter((r) => r.role === 'MASTER_COLLECTOR').length;
    const active = rows.filter((r) => r.isActive).length;
    const unassigned = collectorsOnly.filter((r) => !r.managedById).length;
    const openCases = rows.reduce(
      (sum, r) => sum + (r._count?.assignedCollectionCases ?? 0),
      0,
    );
    return {
      total: rows.length,
      active,
      masterCount,
      unassigned,
      openCases,
    };
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (roleFilter && r.role !== roleFilter) return false;
      if (statusFilter === 'ACTIVE' && !r.isActive) return false;
      if (statusFilter === 'INACTIVE' && r.isActive) return false;
      if (masterFilter === 'UNASSIGNED' && (r.role !== 'COLLECTOR' || r.managedById)) {
        return false;
      }
      if (
        masterFilter &&
        masterFilter !== 'UNASSIGNED' &&
        r.managedById !== masterFilter
      ) {
        return false;
      }
      if (!q) return true;
      return `${r.fullName} ${r.email} ${r.phone ?? ''} ${r.role} ${r.managedBy?.fullName ?? ''}`
        .toLowerCase()
        .includes(q);
    });
  }, [rows, search, roleFilter, statusFilter, masterFilter]);

  const hasFilters =
    search.trim() !== '' ||
    roleFilter !== '' ||
    statusFilter !== '' ||
    masterFilter !== '';

  function openCreate() {
    setNewStaff({
      ...emptyForm,
      role: isMaster ? 'COLLECTOR' : 'COLLECTOR',
    });
    setShowPassword(false);
    createStaff.reset();
    setCreateOpen(true);
  }

  function openAssign(c: Collector) {
    setAssignTarget(c);
    setAssignMasterId(c.managedById ?? '');
    assignMaster.reset();
    setAssignOpen(true);
  }

  if (canStaff && collectors.isLoading) {
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
          <h1 className="text-xl font-bold tracking-tight text-ink">Collectors</h1>
          <p className="mt-0.5 text-sm text-muted">
            {isMaster
              ? 'Your team of collectors and their follow-up phones.'
              : 'Platform staff, master collectors, and team assignments.'}
          </p>
        </div>
        {canStaff ? (
          <Button type="button" onClick={openCreate}>
            <UserPlus className="h-4 w-4" />
            {isMaster ? 'Add collector' : 'Add account'}
          </Button>
        ) : null}
      </div>

      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-ink">Your follow-up phone</p>
            <p className="mt-0.5 text-xs text-muted">
              Used for system-initiated calls and SMS. Required before contact can be
              verified against the device log.
            </p>
          </div>
          {savePhone.isSuccess ? (
            <span className="text-sm text-emerald-700">Saved</span>
          ) : null}
        </div>
        <form
          className="mt-3 flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            savePhone.mutate();
          }}
        >
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Phone
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint"
              aria-hidden
            />
            <Input
              className="pl-9"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+2557…"
              required
            />
          </div>
          <Button type="submit" variant="secondary" disabled={savePhone.isPending}>
            {savePhone.isPending ? 'Saving…' : 'Save phone'}
          </Button>
        </form>
      </Card>

      {canStaff ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard icon={Users} label="Total staff" value={stats.total} tone="brand" />
            <StatCard icon={UserCheck} label="Active" value={stats.active} tone="green" />
            <StatCard
              icon={UserCog}
              label="Master collectors"
              value={stats.masterCount}
              tone="brand"
            />
            <StatCard
              icon={Briefcase}
              label={isPlatformAdmin ? 'Unassigned collectors' : 'Open cases'}
              value={isPlatformAdmin ? stats.unassigned : stats.openCases}
              tone="amber"
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
                    aria-label="Search collectors"
                  />
                </div>
                <Select
                  className="min-w-0 flex-1"
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  aria-label="Filter by role"
                >
                  <option value="">All roles</option>
                  <option value="COLLECTOR">COLLECTOR</option>
                  <option value="MASTER_COLLECTOR">MASTER COLLECTOR</option>
                  {!isMaster ? (
                    <option value="COLLECTIONS_ADMIN">COLLECTIONS ADMIN</option>
                  ) : null}
                </Select>
                <Select
                  className="min-w-0 flex-1"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  aria-label="Filter by status"
                >
                  <option value="">All statuses</option>
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                </Select>
                {isPlatformAdmin ? (
                  <Select
                    className="min-w-0 flex-1"
                    value={masterFilter}
                    onChange={(e) => setMasterFilter(e.target.value)}
                    aria-label="Filter by master"
                  >
                    <option value="">Any master</option>
                    <option value="UNASSIGNED">Unassigned</option>
                    {masters.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.fullName}
                      </option>
                    ))}
                  </Select>
                ) : null}
                {hasFilters ? (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setSearch('');
                      setRoleFilter('');
                      setStatusFilter('');
                      setMasterFilter('');
                    }}
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
                title={rows.length === 0 ? 'No collectors yet' : 'No matching staff'}
                hint={
                  rows.length === 0
                    ? 'Add a collector or master collector account to get started.'
                    : 'Try clearing search or filters.'
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <Table
                  columns={[
                    'Name',
                    'Email',
                    'Role',
                    'Managed by',
                    'Phone',
                    'Open cases',
                    'Status',
                    '',
                  ]}
                >
                  {filtered.map((c) => (
                    <Row key={c.id}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-xs font-semibold text-brand-700">
                            {c.fullName
                              .split(' ')
                              .map((p) => p[0])
                              .filter(Boolean)
                              .slice(0, 2)
                              .join('')
                              .toUpperCase()}
                          </span>
                          <div className="min-w-0">
                            <p className="font-medium text-ink">{c.fullName}</p>
                            {c.role === 'MASTER_COLLECTOR' ? (
                              <p className="text-xs text-muted">
                                Team: {c._count?.managedCollectors ?? 0}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted">{c.email}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex rounded-md bg-canvas px-2 py-0.5 text-xs font-semibold text-ink-soft">
                          {c.role.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted">
                        {c.role === 'COLLECTOR'
                          ? c.managedBy?.fullName ?? (
                              <span className="text-amber-700">Unassigned</span>
                            )
                          : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {c.phone ? (
                          <a
                            href={`tel:${c.phone}`}
                            className="font-medium text-brand-700 hover:underline"
                          >
                            {c.phone}
                          </a>
                        ) : (
                          <span className="text-amber-700">Missing</span>
                        )}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-muted">
                        {c._count?.assignedCollectionCases ?? 0}
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill status={c.isActive ? 'ACTIVE' : 'INACTIVE'} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        {isPlatformAdmin && c.role === 'COLLECTOR' ? (
                          <Button
                            type="button"
                            variant="secondary"
                            className="!py-1.5 !text-xs"
                            onClick={() => openAssign(c)}
                          >
                            Assign master
                          </Button>
                        ) : null}
                      </td>
                    </Row>
                  ))}
                </Table>
              </div>
            )}
          </Card>
        </>
      ) : null}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={isMaster ? 'Add collector' : 'Add account'}
        className="max-w-lg"
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            createStaff.mutate();
          }}
        >
          <p className="text-sm text-muted">
            {isMaster
              ? 'New collectors are added to your team automatically.'
              : 'Create a collector, master collector, or collections admin.'}
          </p>

          <Field label="Full name">
            <Input
              value={newStaff.fullName}
              onChange={(e) => setNewStaff({ ...newStaff, fullName: e.target.value })}
              placeholder="Asha Mwakalinga"
              required
              autoFocus
            />
          </Field>

          <Field label="Email">
            <Input
              type="email"
              value={newStaff.email}
              onChange={(e) => setNewStaff({ ...newStaff, email: e.target.value })}
              placeholder="collector@linda.co.tz"
              required
              autoComplete="off"
            />
          </Field>

          <Field label="Password">
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                value={newStaff.password}
                onChange={(e) => setNewStaff({ ...newStaff, password: e.target.value })}
                required
                minLength={8}
                autoComplete="new-password"
                className="pr-11"
                placeholder="At least 8 characters"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl text-muted transition hover:text-ink"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" aria-hidden />
                ) : (
                  <Eye className="h-4 w-4" aria-hidden />
                )}
              </button>
            </div>
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Role">
              <Select
                value={newStaff.role}
                onChange={(e) => setNewStaff({ ...newStaff, role: e.target.value })}
                disabled={isMaster}
              >
                <option value="COLLECTOR">Collector</option>
                {!isMaster ? (
                  <option value="MASTER_COLLECTOR">Master collector</option>
                ) : null}
                {isSuperAdmin ? (
                  <option value="COLLECTIONS_ADMIN">Collections admin</option>
                ) : null}
              </Select>
            </Field>
            <Field label="Follow-up phone">
              <Input
                value={newStaff.phone}
                onChange={(e) => setNewStaff({ ...newStaff, phone: e.target.value })}
                placeholder="+255…"
                inputMode="tel"
              />
            </Field>
          </div>

          {isPlatformAdmin && newStaff.role === 'COLLECTOR' ? (
            <Field label="Assign to master (optional)">
              <Select
                value={newStaff.managedById}
                onChange={(e) =>
                  setNewStaff({ ...newStaff, managedById: e.target.value })
                }
              >
                <option value="">Unassigned</option>
                {masters.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.fullName}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          <div className="flex flex-wrap gap-2 border-t border-line pt-4">
            <Button type="submit" disabled={createStaff.isPending}>
              <UserPlus className="h-4 w-4" />
              {createStaff.isPending ? 'Creating…' : 'Create account'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
          </div>

          {createStaff.isError ? (
            <p className="text-sm text-rose-600">
              Could not create — that email may already be in use.
            </p>
          ) : null}
        </form>
      </Modal>

      <Modal
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        title="Assign master collector"
        className="max-w-md"
      >
        {assignTarget ? (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              assignMaster.mutate();
            }}
          >
            <p className="text-sm text-muted">
              Assign <span className="font-medium text-ink">{assignTarget.fullName}</span>{' '}
              to a master collector who will manage their workload.
            </p>
            <Field label="Master collector">
              <Select
                value={assignMasterId}
                onChange={(e) => setAssignMasterId(e.target.value)}
              >
                <option value="">Unassigned</option>
                {masters.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.fullName} ({m.email})
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex flex-wrap gap-2 border-t border-line pt-4">
              <Button type="submit" disabled={assignMaster.isPending}>
                {assignMaster.isPending ? 'Saving…' : 'Save assignment'}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setAssignOpen(false)}>
                Cancel
              </Button>
            </div>
            {assignMaster.isError ? (
              <p className="text-sm text-rose-600">Could not update assignment.</p>
            ) : null}
          </form>
        ) : null}
      </Modal>
    </div>
  );
}
