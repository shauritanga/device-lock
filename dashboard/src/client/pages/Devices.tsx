import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight } from '@/shared/icons';
import { api } from '@/shared/api/client';
import type { Device } from '@/shared/api/types';
import { Card } from '@/shared/components/ui/Card';
import { Table, Row } from '@/shared/components/ui/Table';
import { StatusDot } from '@/shared/components/ui/Pill';
import { Center, EmptyState, Spinner } from '@/shared/components/ui/misc';
import { FigureStrip } from '@/shared/components/FigureStrip';
import { ListToolbar } from '@/shared/components/ListToolbar';
import { PanelEmpty } from '@/shared/components/Panel';
import { shortDate } from '@/shared/lib/format';

const STATUS_FILTERS = [
  { value: 'ALL', label: 'All statuses' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'LOCKED', label: 'Locked' },
  { value: 'PENDING_ENROLLMENT', label: 'Pending enrollment' },
  { value: 'RELEASED', label: 'Released' },
  { value: 'DEFAULTED', label: 'Defaulted' },
];

/** Fleet operations — lock status, enrollment QR, SIM alerts. */
export default function Devices() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('ALL');

  const { data, isLoading } = useQuery({
    queryKey: ['devices'],
    queryFn: async () => (await api.get<Device[]>('/devices')).data,
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
          { label: 'Total devices', value: counts.total },
          { label: 'Active', value: counts.active },
          { label: 'Locked', value: counts.locked },
          { label: 'Pending enrollment', value: counts.pending },
        ]}
      />

      <Card>
        <ListToolbar
          title="All devices"
          noun="device"
          count={rows.length}
          query={query}
          onQuery={setQuery}
          placeholder="Search IMEI, customer, model"
          filter={{ value: status, onChange: setStatus, options: STATUS_FILTERS }}
        />
        {!data || data.length === 0 ? (
          <div className="p-5">
            <EmptyState title="No devices yet" hint="Devices appear here once they are registered." />
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
