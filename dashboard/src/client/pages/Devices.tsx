import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { api } from '@/shared/api/client';
import type { Device } from '@/shared/api/types';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Table, Row } from '@/shared/components/ui/Table';
import { StatusPill } from '@/shared/components/ui/Pill';
import { Center, EmptyState, Spinner } from '@/shared/components/ui/misc';
import { shortDate } from '@/shared/lib/format';

/**
 * Fleet operations — lock status, enrollment QR, SIM alerts.
 * New financed phones are created on Sales, not here.
 */
export default function Devices() {
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['devices'],
    queryFn: async () => (await api.get<Device[]>('/devices')).data,
  });

  if (isLoading) {
    return (
      <Center>
        <Spinner />
      </Center>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Devices</h2>
          <p className="text-sm text-muted">
            Enrolled phones — lock status, check-in, and enrollment QR. Start a
            credit sale under Sales to add a new financed device.
          </p>
        </div>
        <Button variant="secondary" onClick={() => navigate('/sales')}>
          <Plus className="h-4 w-4" /> New credit sale
        </Button>
      </div>

      <Card className="p-3">
        {!data || data.length === 0 ? (
          <EmptyState
            title="No devices yet"
            hint="Create a credit sale to register the customer, phone, and loan together. Then open the device here for the enrollment QR."
          />
        ) : (
          <Table
            columns={['IMEI', 'Customer', 'Model', 'Status', 'Last check-in', '']}
          >
            {data.map((d) => (
              <Row key={d.id} onClick={() => navigate(`/devices/${d.id}`)}>
                <td className="px-4 py-3 font-medium tabular-nums">{d.imei}</td>
                <td className="px-4 py-3 text-muted">
                  {d.customer?.fullName ?? '—'}
                </td>
                <td className="px-4 py-3 text-muted">
                  {[d.make, d.model].filter(Boolean).join(' ') || '—'}
                </td>
                <td className="px-4 py-3">
                  <StatusPill status={d.status} />
                </td>
                <td className="px-4 py-3 text-muted">
                  {shortDate(d.lastCheckInAt)}
                </td>
                <td className="px-4 py-3 text-right text-xs text-brand-700">
                  Manage →
                </td>
              </Row>
            ))}
          </Table>
        )}
      </Card>

      {data && data.length === 0 ? (
        <p className="text-center text-sm text-muted">
          <Link to="/sales" className="font-medium text-brand-700 hover:underline">
            Go to Sales
          </Link>{' '}
          to start your first financed phone.
        </p>
      ) : null}
    </div>
  );
}
