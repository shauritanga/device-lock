import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Trash2 } from '@/shared/icons';
import { useAuth } from '@/shared/auth/AuthContext';
import { apiErrorMessage } from '@/shared/agreements/apiError';
import { Button } from '@/shared/components/ui/Button';
import { Modal } from '@/shared/components/ui/Modal';
import { api } from '@/shared/api/client';
import type { Device } from '@/shared/api/types';
import { Card } from '@/shared/components/ui/Card';
import { Table, Row } from '@/shared/components/ui/Table';
import { StatusDot } from '@/shared/components/ui/Pill';
import { Center, EmptyState, Spinner } from '@/shared/components/ui/misc';
import { FigureStrip } from '@/shared/components/FigureStrip';
import { Tabs } from '@/shared/components/Tabs';
import { ListToolbar } from '@/shared/components/ListToolbar';
import { PanelEmpty } from '@/shared/components/Panel';
import { shortDate } from '@/shared/lib/format';
import { RegisteredTab } from './RegisterDevices';

const STATUS_FILTERS = [
  { value: 'ALL', label: 'All statuses' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'LOCKED', label: 'Locked' },
  { value: 'PENDING_ENROLLMENT', label: 'Pending enrollment' },
  { value: 'RELEASED', label: 'Released' },
  { value: 'DEFAULTED', label: 'Defaulted' },
];

type Tab = 'all' | 'registered' | 'sold';

/**
 * One page for every phone: All (every registered phone, sold or not), Registered
 * (in stock, not sold yet) and Sold (given to a customer: lock status, enrollment
 * QR, SIM alerts).
 */
export default function Devices() {
  const [params, setParams] = useSearchParams();
  const t = params.get('tab');
  const tab: Tab = t === 'sold' ? 'sold' : t === 'registered' ? 'registered' : 'all';
  return (
    <div className="space-y-5">
      <Tabs<Tab>
        label="Devices"
        value={tab}
        onChange={(next) => setParams(next === 'all' ? {} : { tab: next }, { replace: true })}
        tabs={[
          { id: 'all', label: 'All phones' },
          { id: 'registered', label: 'Registered' },
          { id: 'sold', label: 'Sold' },
        ]}
      />
      {tab === 'all' ? <AllTab /> : tab === 'registered' ? <RegisteredTab /> : <SoldTab />}
    </div>
  );
}

/** Every phone the shop has registered, whether it is still in stock, with an agent, or sold. */
function AllTab() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [where, setWhere] = useState('ALL');

  const { data, isLoading } = useQuery({
    queryKey: ['devices'],
    queryFn: async () => (await api.get<Device[]>('/devices')).data,
  });

  const placeOf = (d: Device) =>
    d.customerId || d.loan ? 'SOLD' : d.assignedAgent ? 'AGENT' : 'SHOP';

  const counts = useMemo(() => {
    const all = data ?? [];
    const n = (p: string) => all.filter((d) => placeOf(d) === p).length;
    return { total: all.length, shop: n('SHOP'), agent: n('AGENT'), sold: n('SOLD') };
  }, [data]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data ?? []).filter((d) => {
      if (where !== 'ALL' && placeOf(d) !== where) return false;
      if (!q) return true;
      return [d.imei, d.customer?.fullName, d.assignedAgent?.fullName, d.make, d.model]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [data, query, where]);

  if (isLoading) {
    return (
      <Center>
        <Spinner />
      </Center>
    );
  }

  return (
    <div className="space-y-5">
      <FigureStrip
        items={[
          { label: 'All phones', value: counts.total },
          { label: 'Held by the shop', value: counts.shop },
          { label: 'With agents', value: counts.agent },
          { label: 'Sold', value: counts.sold },
        ]}
      />
      <Card>
        <ListToolbar
          title="All phones"
          noun="phone"
          count={rows.length}
          query={query}
          onQuery={setQuery}
          placeholder="Search IMEI, customer, agent, model"
          filter={{
            value: where,
            onChange: setWhere,
            options: [
              { value: 'ALL', label: 'Everywhere' },
              { value: 'SHOP', label: 'Held by the shop' },
              { value: 'AGENT', label: 'With an agent' },
              { value: 'SOLD', label: 'Sold' },
            ],
          }}
        />
        {!data || data.length === 0 ? (
          <div className="p-5">
            <EmptyState title="No phones yet" hint="Register phones from the Registered tab." />
          </div>
        ) : rows.length === 0 ? (
          <PanelEmpty>No phones match your search.</PanelEmpty>
        ) : (
          <Table columns={['IMEI', 'Model', 'Held by', 'Status', 'Last check-in', '']}>
            {rows.map((d) => (
              <Row key={d.id} onClick={() => navigate(`/devices/${d.id}`)}>
                <td className="px-4 py-3 font-medium tabular-nums text-ink">{d.imei}</td>
                <td className="px-4 py-3 text-muted">
                  {[d.make, d.model].filter(Boolean).join(' ') || '—'}
                </td>
                <td className="px-4 py-3 text-muted">
                  {placeOf(d) === 'SOLD'
                    ? `Sold to ${d.customer?.fullName ?? 'a customer'}`
                    : placeOf(d) === 'AGENT'
                      ? `Agent: ${d.assignedAgent?.fullName}`
                      : 'Shop'}
                </td>
                <td className="px-4 py-3"><StatusDot status={d.status} /></td>
                <td className="px-4 py-3 text-muted">{shortDate(d.lastCheckInAt)}</td>
                <td className="px-4 py-3 text-right text-xs text-brand-600">
                  <span className="inline-flex items-center gap-1">
                    Manage <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </td>
              </Row>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}

/** Phones given to customers on credit: lock status, enrollment QR, SIM alerts. */
function SoldTab() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isOwner = useAuth().user?.role === 'OWNER';
  const [toRemove, setToRemove] = useState<Device | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('ALL');

  const { data, isLoading } = useQuery({
    queryKey: ['devices'],
    queryFn: async () => (await api.get<Device[]>('/devices')).data,
    select: (all) => all.filter((d) => !!d.customerId || !!d.loan),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/devices/${id}`)).data,
    onSuccess: () => {
      setToRemove(null);
      qc.invalidateQueries({ queryKey: ['devices'] });
    },
  });

  const counts = useMemo(() => {
    const all = data ?? [];
    const n = (s: string) => all.filter((d) => d.status === s).length;
    return { total: all.length, active: n('ACTIVE'), locked: n('LOCKED'), pending: n('PENDING_ENROLLMENT') };
  }, [data]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data ?? []).filter((d) => {
      if (status !== 'ALL' && d.status !== status) return false;
      if (!q) return true;
      return [d.imei, d.customer?.fullName, d.make, d.model]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [data, query, status]);

  if (isLoading) {
    return (
      <Center>
        <Spinner />
      </Center>
    );
  }

  return (
    <div className="space-y-5">
      <FigureStrip
        items={[
          { label: 'Sold phones', value: counts.total },
          { label: 'Active', value: counts.active },
          { label: 'Locked', value: counts.locked },
          { label: 'Pending enrollment', value: counts.pending },
        ]}
      />

      <Card>
        <ListToolbar
          title="Sold phones"
          noun="device"
          count={rows.length}
          query={query}
          onQuery={setQuery}
          placeholder="Search IMEI, customer, model"
          filter={{ value: status, onChange: setStatus, options: STATUS_FILTERS }}
        />
        {!data || data.length === 0 ? (
          <div className="p-5">
            <EmptyState title="No phones sold yet" hint="Phones appear here once they are sold to a customer on credit." />
          </div>
        ) : rows.length === 0 ? (
          <PanelEmpty>No devices match your search.</PanelEmpty>
        ) : (
          <Table columns={['IMEI', 'Customer', 'Model', 'Status', 'Last check-in', '']}>
            {rows.map((d) => (
              <Row key={d.id} onClick={() => navigate(`/devices/${d.id}`)}>
                <td className="px-4 py-3 font-medium tabular-nums text-ink">{d.imei}</td>
                <td className="px-4 py-3 text-muted">{d.customer?.fullName ?? '—'}</td>
                <td className="px-4 py-3 text-muted">
                  {[d.make, d.model].filter(Boolean).join(' ') || '—'}
                </td>
                <td className="px-4 py-3"><StatusDot status={d.status} /></td>
                <td className="px-4 py-3 text-muted">{shortDate(d.lastCheckInAt)}</td>
                <td className="px-4 py-3 text-right text-xs text-brand-600">
                  <span className="inline-flex items-center gap-3">
                    {isOwner && d.status === 'RELEASED' ? (
                      <button
                        type="button"
                        title="Remove from list"
                        aria-label={`Remove ${d.imei} from the list`}
                        onClick={(e) => {
                          e.stopPropagation();
                          remove.reset();
                          setToRemove(d);
                        }}
                        className="rounded-lg p-1.5 text-muted hover:bg-rose-50 hover:text-rose-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : null}
                    <span className="inline-flex items-center gap-1">
                      Manage <ArrowRight className="h-3.5 w-3.5" />
                    </span>
                  </span>
                </td>
              </Row>
            ))}
          </Table>
        )}
      </Card>

      <Modal
        open={!!toRemove}
        onClose={() => !remove.isPending && setToRemove(null)}
        title="Remove released phone"
        size="sm"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setToRemove(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={remove.isPending}
              onClick={() => toRemove && remove.mutate(toRemove.id)}
            >
              {remove.isPending ? 'Removing…' : 'Remove'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-soft">
          Remove <span className="font-medium text-ink">{toRemove?.imei}</span> from your device
          list? It already belongs to the customer. The sale and its payment history stay in Sales.
        </p>
        {remove.isError ? (
          <p className="mt-3 text-sm text-rose-600">{apiErrorMessage(remove.error)}</p>
        ) : null}
      </Modal>
    </div>
  );
}
