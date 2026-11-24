import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, Search } from '@/shared/icons';
import { useNavigate } from 'react-router-dom';
import { api } from '@/shared/api/client';
import { Card } from '@/shared/components/ui/Card';
import { Table, Row } from '@/shared/components/ui/Table';
import { StatusDot } from '@/shared/components/ui/Pill';
import { Center, EmptyState, Spinner } from '@/shared/components/ui/misc';
import { Modal } from '@/shared/components/ui/Modal';
import { Input } from '@/shared/components/ui/Field';
import { Tabs } from '@/shared/components/Tabs';
import { cn } from '@/shared/lib/cn';
import { ago, isStale, money, shortDate } from '@/shared/lib/format';
import { useAuth } from '@/shared/auth/AuthContext';
import { PLATFORM_ADMIN_ROLES, roleAllowed } from '@/shared/auth/roles';
import { DeviceLockActions, DeviceLockDialog } from '../components/DeviceLockDialog';

type AdminDevice = {
  id: string;
  imei: string;
  make?: string | null;
  model?: string | null;
  status: string;
  lastCheckInAt?: string | null;
  tenant: { id: string; name: string };
  customer?: { id: string; fullName: string; phone: string; address?: string | null } | null;
  loan?: {
    id: string;
    status: string;
    overdueInstallments: number;
    nextDue?: { sequence: number; dueDate: string; amountDue: number } | null;
    collectionCase?: { id: string; status: string } | null;
  } | null;
};

type Tab = 'all' | 'sold';
type Filter = 'all' | 'overdue' | 'locked';
const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'locked', label: 'Locked' },
];

function nextDueCell(d: AdminDevice) {
  if (!d.loan) return <span className="text-muted">—</span>;
  if (!d.loan.nextDue) {
    return d.loan.status === 'COMPLETED' ? (
      <span className="text-emerald-600">Completed</span>
    ) : (
      <span className="text-muted">—</span>
    );
  }
  const due = new Date(d.loan.nextDue.dueDate);
  const late = Math.floor((Date.now() - due.getTime()) / 86_400_000);
  if (d.loan.nextDue.sequence === 0) {
    return (
      <>
        <div className="font-medium text-rose-600">Deposit not paid</div>
        <div className="text-xs tabular-nums text-muted">{money(d.loan.nextDue.amountDue)}</div>
      </>
    );
  }
  return late >= 1 ? (
    <>
      <div className="font-medium text-rose-600">
        Overdue {late} {late === 1 ? 'day' : 'days'}
      </div>
      <div className="text-xs tabular-nums text-muted">
        since {shortDate(d.loan.nextDue.dueDate)} · {money(d.loan.nextDue.amountDue)}
      </div>
    </>
  ) : (
    <>
      <div className="text-ink">{shortDate(d.loan.nextDue.dueDate)}</div>
      <div className="text-xs tabular-nums text-muted">{money(d.loan.nextDue.amountDue)}</div>
    </>
  );
}

/** Platform-admin view of every registered device, and of the subset actually sold to a customer. */
export default function Devices() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canLockDevices = roleAllowed(user?.role, PLATFORM_ADMIN_ROLES);
  const [lockAction, setLockAction] = useState<'LOCK' | 'UNLOCK' | null>(null);
  const [tab, setTab] = useState<Tab>('all');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-devices', q, filter],
    queryFn: async () =>
      (
        await api.get<AdminDevice[]>('/collections/devices', {
          params: {
            ...(q.trim() ? { q: q.trim() } : {}),
            ...(filter === 'locked' ? { status: 'LOCKED' } : {}),
          },
        })
      ).data,
  });

  const rows = useMemo(() => {
    const base = tab === 'sold' ? (data ?? []).filter((d) => d.loan) : data ?? [];
    return filter === 'overdue' ? base.filter((d) => (d.loan?.overdueInstallments ?? 0) > 0) : base;
  }, [data, tab, filter]);

  const selected = data?.find((d) => d.id === selectedId) ?? null;

  return (
    <div className="space-y-4">
      <Tabs
        label="Devices"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'all', label: 'All phones' },
          { id: 'sold', label: 'Sold' },
        ]}
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[16rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            className="!pl-9"
            placeholder="Search customer, phone, IMEI or company"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={cn(
              'rounded-full border px-3.5 py-1.5 text-sm transition',
              filter === f.id
                ? 'border-brand-500 bg-brand-50 font-medium text-brand-800'
                : 'border-line bg-surface text-ink hover:bg-canvas',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <Center>
          <Spinner />
        </Center>
      ) : !data || data.length === 0 ? (
        <Card className="p-3">
          <EmptyState
            title="No devices registered"
            hint="Devices appear here once a seller registers a phone."
          />
        </Card>
      ) : rows.length === 0 ? (
        <Card className="p-3">
          <EmptyState
            title="No phones match"
            hint="Try a different search or filter."
          />
        </Card>
      ) : (
        <Card className="p-3">
          <Table columns={['Customer', 'Company', 'IMEI', 'Enrolled', 'Status', 'Next due', 'Last seen']}>
            {rows.map((d) => (
              <Row key={d.id} onClick={() => setSelectedId(d.id)}>
                <td className="px-4 py-3">
                  <div className="font-medium">{d.customer?.fullName ?? '—'}</div>
                  <div className="text-xs text-muted">{d.customer?.phone}</div>
                </td>
                <td className="px-4 py-3 text-muted">{d.tenant.name}</td>
                <td className="px-4 py-3 tabular-nums text-muted">
                  {d.imei}
                  {d.model ? ` · ${d.model}` : ''}
                </td>
                <td className="px-4 py-3 text-muted">
                  {d.status === 'PENDING_ENROLLMENT' ? 'No' : 'Yes'}
                </td>
                <td className="px-4 py-3">
                  {d.status === 'LOCKED' ? (
                    <StatusDot status="LOCKED" label="Locked" />
                  ) : (
                    <StatusDot status="ACTIVE" label="Unlocked" />
                  )}
                </td>
                <td className="px-4 py-3">{nextDueCell(d)}</td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1',
                      d.status !== 'PENDING_ENROLLMENT' && isStale(d.lastCheckInAt)
                        ? 'font-medium text-amber-700'
                        : 'text-muted',
                    )}
                  >
                    {d.status !== 'PENDING_ENROLLMENT' && isStale(d.lastCheckInAt) ? (
                      <AlertTriangle className="h-3.5 w-3.5" />
                    ) : null}
                    {ago(d.lastCheckInAt)}
                  </span>
                </td>
              </Row>
            ))}
          </Table>
        </Card>
      )}

      <Modal
        open={!!selected}
        onClose={() => setSelectedId(null)}
        title={selected?.customer?.fullName ?? 'Device'}
      >
        {selected ? (
          <div className="space-y-3">
            <div className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <p className="text-xs text-muted">Phone</p>
                <p>{selected.customer?.phone ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted">Address</p>
                <p>{selected.customer?.address ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted">Company</p>
                <p>{selected.tenant.name}</p>
              </div>
              <div>
                <p className="text-xs text-muted">Last check-in</p>
                <p>{ago(selected.lastCheckInAt)}</p>
              </div>
            </div>
            {canLockDevices ? (
              <div className="flex flex-wrap gap-2 border-t border-line pt-3">
                <DeviceLockActions
                  device={{
                    id: selected.id,
                    imei: selected.imei,
                    model: selected.model,
                    customerName: selected.customer?.fullName,
                    company: selected.tenant.name,
                    status: selected.status,
                  }}
                  onAction={setLockAction}
                />
              </div>
            ) : null}
            {selected.loan?.collectionCase ? (
              <button
                type="button"
                className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline"
                onClick={() => navigate(`/cases/${selected.loan!.collectionCase!.id}`)}
              >
                Open collections case <ArrowRight className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
        ) : null}
      </Modal>

      <DeviceLockDialog
        device={
          selected && lockAction
            ? {
                id: selected.id,
                imei: selected.imei,
                model: selected.model,
                customerName: selected.customer?.fullName,
                company: selected.tenant.name,
                status: selected.status,
              }
            : null
        }
        action={lockAction ?? 'LOCK'}
        onClose={() => setLockAction(null)}
      />
    </div>
  );
}
