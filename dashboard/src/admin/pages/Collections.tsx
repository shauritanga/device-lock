import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Briefcase,
  Headphones,
  Inbox,
  RefreshCw,
  Search,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { api } from '@/shared/api/client';
import { useAuth } from '@/shared/auth/AuthContext';
import { PLATFORM_ADMIN_ROLES, roleAllowed } from '@/shared/auth/roles';
import { StatCard } from '@/shared/components/StatCard';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Table, Row } from '@/shared/components/ui/Table';
import { StatusPill } from '@/shared/components/ui/Pill';
import { EmptyState, Center, Spinner } from '@/shared/components/ui/misc';
import { Modal } from '@/shared/components/ui/Modal';
import { Field, Input, Select } from '@/shared/components/ui/Field';
import { money, shortDate } from '@/shared/lib/format';
import type { CollectionCase } from '@/shared/components/CaseList';

type Collector = {
  id: string;
  fullName: string;
  email: string;
  role: string;
  phone?: string | null;
  isActive: boolean;
  _count?: { assignedCollectionCases: number };
};

const OPEN_STATUSES = ['OPEN', 'IN_PROGRESS', 'PROMISED', 'ESCALATED'] as const;
const CASE_STATUSES = [
  'OPEN',
  'IN_PROGRESS',
  'PROMISED',
  'PAID',
  'ESCALATED',
  'CLOSED',
] as const;

/**
 * Cases inbox for the platform call centre — stats, search/filters, table.
 * New cases are auto-assigned to collectors (max 55 per collector per day).
 */
export default function Collections() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const isPlatformAdmin = roleAllowed(user?.role, PLATFORM_ADMIN_ROLES);
  const canAssign =
    isPlatformAdmin || user?.role === 'MASTER_COLLECTOR';

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [assignmentFilter, setAssignmentFilter] = useState<
    '' | 'unassigned' | 'assigned' | 'mine'
  >('');
  const [companyFilter, setCompanyFilter] = useState('');

  const [assignCaseId, setAssignCaseId] = useState<string | null>(null);
  const [assignTo, setAssignTo] = useState('');

  const cases = useQuery({
    queryKey: ['collections', 'cases', 'all'],
    queryFn: async () => (await api.get<CollectionCase[]>('/collections/cases')).data,
    enabled: Boolean(user),
  });

  const collectors = useQuery({
    queryKey: ['collections', 'collectors'],
    queryFn: async () => (await api.get<Collector[]>('/collections/collectors')).data,
    enabled: canAssign,
  });

  const sync = useMutation({
    mutationFn: async () =>
      (await api.post<{
        tenants: number;
        cases: number;
        autoAssigned: number;
        dailyCap: number;
      }>('/collections/sync')).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['collections'] }),
  });

  const autoAssign = useMutation({
    mutationFn: async () =>
      (
        await api.post('/collections/cases/auto-assign', { limit: 2000 })
      ).data as {
        assigned: number;
        dailyCap?: number;
        skippedReason?: string;
      },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['collections'] }),
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

  const rows = cases.data ?? [];

  const stats = useMemo(() => {
    const open = rows.filter((r) =>
      (OPEN_STATUSES as readonly string[]).includes(r.status),
    );
    const unassigned = open.filter((r) => !r.assignedToId).length;
    const inProgress = rows.filter((r) => r.status === 'IN_PROGRESS').length;
    const promised = rows.filter((r) => r.status === 'PROMISED').length;
    return {
      total: rows.length,
      open: open.length,
      unassigned,
      inProgress,
      promised,
    };
  }, [rows]);

  const companies = useMemo(() => {
    const names = [
      ...new Set(rows.map((r) => r.companyName).filter(Boolean) as string[]),
    ];
    return names.sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter && r.status !== statusFilter) return false;
      if (companyFilter && r.companyName !== companyFilter) return false;
      if (assignmentFilter === 'unassigned' && r.assignedToId) return false;
      if (assignmentFilter === 'assigned' && !r.assignedToId) return false;
      if (assignmentFilter === 'mine' && r.assignedToId !== user?.userId) {
        return false;
      }
      if (!q) return true;
      const hay = [
        r.companyName,
        r.customerName,
        r.customerPhone,
        r.deviceImei,
        r.deviceModel,
        r.status,
        r.assignedTo?.fullName,
        r.source,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search, statusFilter, companyFilter, assignmentFilter, user?.userId]);

  const hasFilters =
    search.trim() !== '' ||
    statusFilter !== '' ||
    companyFilter !== '' ||
    assignmentFilter !== '';

  const assignTarget = useMemo(
    () => rows.find((r) => r.id === assignCaseId) ?? null,
    [rows, assignCaseId],
  );

  function clearFilters() {
    setSearch('');
    setStatusFilter('');
    setCompanyFilter('');
    setAssignmentFilter('');
  }

  function openAssign(id: string) {
    setAssignCaseId(id);
    setAssignTo(collectors.data?.[0]?.id ?? '');
    assign.reset();
  }

  if (!user || cases.isLoading) {
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
          <h1 className="hidden text-xl font-bold tracking-tight text-ink md:block">Cases</h1>
          <p className="mt-0.5 text-sm text-muted">
            Managed collections cases — arriving work is auto-assigned to collectors
            (max 55 per collector per day).
          </p>
        </div>
        {isPlatformAdmin ? (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => autoAssign.mutate()}
              disabled={autoAssign.isPending}
            >
              <UserPlus className="h-4 w-4" />
              {autoAssign.isPending
                ? 'Assigning…'
                : autoAssign.isSuccess
                  ? `Assigned ${autoAssign.data.assigned}`
                  : 'Auto-assign'}
            </Button>
            <Button
              type="button"
              onClick={() => sync.mutate()}
              disabled={sync.isPending}
            >
              <RefreshCw className={`h-4 w-4 ${sync.isPending ? 'animate-spin' : ''}`} />
              {sync.isPending
                ? 'Syncing…'
                : sync.isSuccess
                  ? `Synced · +${sync.data.autoAssigned} assigned`
                  : 'Sync & auto-assign'}
            </Button>
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Briefcase} label="All cases" value={stats.total} tone="brand" />
        <StatCard
          icon={Inbox}
          label="Unassigned"
          value={stats.unassigned}
          hint="Waiting for a collector"
          tone="amber"
        />
        <StatCard
          icon={Headphones}
          label="In progress"
          value={stats.inProgress}
          tone="brand"
        />
        <StatCard
          icon={Users}
          label="Promised"
          value={stats.promised}
          hint="Open PTP commitments"
          tone="green"
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
                aria-label="Search cases"
              />
            </div>
            <Select
              className="w-full min-w-0 sm:w-auto sm:min-w-[9rem] sm:flex-1"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter by status"
            >
              <option value="">All statuses</option>
              {CASE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, ' ')}
                </option>
              ))}
            </Select>
            <Select
              className="w-full min-w-0 sm:w-auto sm:min-w-[9rem] sm:flex-1"
              value={assignmentFilter}
              onChange={(e) =>
                setAssignmentFilter(
                  e.target.value as '' | 'unassigned' | 'assigned' | 'mine',
                )
              }
              aria-label="Filter by assignment"
            >
              <option value="">Any assignment</option>
              <option value="unassigned">Unassigned</option>
              <option value="assigned">Assigned</option>
              <option value="mine">Assigned to me</option>
            </Select>
            <Select
              className="w-full min-w-0 sm:w-auto sm:min-w-[9rem] sm:flex-1"
              value={companyFilter}
              onChange={(e) => setCompanyFilter(e.target.value)}
              aria-label="Filter by company"
            >
              <option value="">All companies</option>
              {companies.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
            {hasFilters ? (
              <Button
                type="button"
                variant="ghost"
                onClick={clearFilters}
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
            title={rows.length === 0 ? 'No cases yet' : 'No matching cases'}
            hint={
              rows.length === 0
                ? isPlatformAdmin
                  ? 'Activate a subscription and run Sync & auto-assign.'
                  : 'Cases assigned to you will show up here.'
                : 'Try clearing search or filters.'
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <Table
              columns={[
                'Company',
                'Customer',
                'Device',
                'Days',
                'Due',
                'Collector',
                'Status',
                'Amount',
                ...(canAssign ? [''] : []),
              ]}
            >
              {filtered.map((row) => (
                <Row key={row.id}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-ink">{row.companyName ?? '—'}</p>
                    {row.source === 'SELLER_HANDOFF' ? (
                      <p className="mt-0.5 text-xs text-brand-700">Handed over</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      to={`/cases/${row.id}`}
                      className="font-medium text-brand-700 hover:underline"
                    >
                      {row.customerName ?? '—'}
                    </Link>
                    <p className="text-xs text-muted">{row.customerPhone ?? '—'}</p>
                  </td>
                  <td className="px-4 py-3 text-muted">
                    <p className="tabular-nums">{row.deviceImei ?? '—'}</p>
                    <p className="text-xs">{row.deviceModel ?? ''}</p>
                  </td>
                  <td className="px-4 py-3 tabular-nums text-ink">{row.daysOverdue}</td>
                  <td className="px-4 py-3 tabular-nums text-muted">
                    {row.dueDate ? shortDate(row.dueDate) : '—'}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {row.assignedTo?.fullName ?? (
                      <span className="text-amber-700">Unassigned</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={row.status} />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium text-ink">
                    {money(row.amountDue, row.currency)}
                  </td>
                  {canAssign ? (
                    <td className="px-4 py-3 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        className="px-2.5"
                        onClick={() => openAssign(row.id)}
                      >
                        Assign
                      </Button>
                    </td>
                  ) : null}
                </Row>
              ))}
            </Table>
          </div>
        )}
      </Card>

      {assignCaseId && canAssign ? (
        <Modal
          open
          onClose={() => {
            setAssignCaseId(null);
            setAssignTo('');
          }}
          title="Assign case"
        >
          <div className="space-y-4">
            <p className="text-sm text-muted">
              {assignTarget
                ? `${assignTarget.customerName ?? 'Case'} · ${assignTarget.companyName ?? '—'}`
                : `Case ${assignCaseId}`}
            </p>
            <Field label="Collector">
              <Select value={assignTo} onChange={(e) => setAssignTo(e.target.value)}>
                <option value="">Select…</option>
                {(collectors.data ?? [])
                  .filter((c) => c.isActive)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.fullName}
                      {c._count?.assignedCollectionCases != null
                        ? ` · ${c._count.assignedCollectionCases} open`
                        : ''}
                    </option>
                  ))}
              </Select>
            </Field>
            {assign.isError ? (
              <p className="text-sm text-rose-600">
                Could not assign — pick a collector and try again.
              </p>
            ) : null}
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setAssignCaseId(null);
                  setAssignTo('');
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => assign.mutate()}
                disabled={assign.isPending || !assignTo}
              >
                {assign.isPending ? 'Assigning…' : 'Confirm assign'}
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
