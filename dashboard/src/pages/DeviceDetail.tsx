import { useParams, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { Lock, Unlock, ArrowLeft, RefreshCw, CheckCircle2 } from 'lucide-react';
import { api } from '../api/client';
import type { Device, DeviceCommand } from '../api/types';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { StatusPill } from '../components/ui/Pill';
import { Center, EmptyState, Spinner } from '../components/ui/misc';
import { shortDate } from '../lib/format';

type EnrollmentPayload = {
  enrollmentToken: string;
  expiresAt: string;
  consumedAt?: string | null;
  qr: Record<string, unknown>;
};

export default function DeviceDetail() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();

  const { data: device, isLoading } = useQuery({
    queryKey: ['device', id],
    queryFn: async () => (await api.get<Device>(`/devices/${id}`)).data,
  });
  const { data: commands } = useQuery({
    queryKey: ['device', id, 'commands'],
    queryFn: async () => (await api.get<DeviceCommand[]>(`/devices/${id}/commands`)).data,
  });
  const { data: enroll } = useQuery({
    queryKey: ['device', id, 'qr'],
    queryFn: async () => (await api.get<EnrollmentPayload>(`/devices/${id}/qr`)).data,
    retry: false,
  });

  const regenerate = useMutation({
    mutationFn: async () => (await api.post(`/devices/${id}/enrollment-token`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['device', id, 'qr'] });
      qc.invalidateQueries({ queryKey: ['device', id] });
    },
  });

  const lock = useMutation({
    mutationFn: async () =>
      (await api.post(`/devices/${id}/lock`, { reason: 'manual lock from console' })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['device', id] }),
  });
  const unlock = useMutation({
    mutationFn: async () =>
      (await api.post(`/devices/${id}/unlock`, { reason: 'manual unlock from console' })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['device', id] }),
  });

  if (isLoading || !device) return <Center><Spinner /></Center>;

  return (
    <div className="space-y-6">
      <Link to="/devices" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Back to devices
      </Link>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Overview */}
        <Card className="lg:col-span-2">
          <CardHeader
            title={`${device.make ?? 'Device'} ${device.model ?? ''}`.trim()}
            subtitle={`IMEI ${device.imei}`}
            action={<StatusPill status={device.status} />}
          />
          <dl className="grid grid-cols-2 gap-4 p-6 text-sm">
            <Info label="Customer" value={device.customer?.fullName ?? '—'} />
            <Info label="Phone" value={device.customer?.phone ?? '—'} />
            <Info label="Last check-in" value={shortDate(device.lastCheckInAt)} />
            <Info label="Locked at" value={shortDate(device.lockedAt)} />
            <Info
              label="Loan"
              value={
                device.loan ? (
                  <Link className="text-brand-700 underline" to={`/loans/${device.loan.id}`}>
                    View loan
                  </Link>
                ) : (
                  '—'
                )
              }
            />
          </dl>
          <div className="flex gap-2 px-6 pb-6">
            <Button variant="danger" onClick={() => lock.mutate()} disabled={lock.isPending}>
              <Lock className="h-4 w-4" /> Lock
            </Button>
            <Button variant="secondary" onClick={() => unlock.mutate()} disabled={unlock.isPending}>
              <Unlock className="h-4 w-4" /> Unlock
            </Button>
          </div>
        </Card>

        {/* Enrollment */}
        <Card>
          <CardHeader
            title="Enrollment"
            subtitle="Scan on a factory-reset device"
            action={
              <Button
                variant="ghost"
                onClick={() => regenerate.mutate()}
                disabled={regenerate.isPending}
                title="Issue a fresh token"
              >
                <RefreshCw className={`h-4 w-4 ${regenerate.isPending ? 'animate-spin' : ''}`} />
              </Button>
            }
          />
          <div className="p-6">
            {!enroll ? (
              <EmptyState title="No active token" hint="Regenerate to issue one." />
            ) : enroll.consumedAt ? (
              <div className="flex flex-col items-center py-4 text-center">
                <CheckCircle2 className="h-10 w-10 text-emerald-500" />
                <p className="mt-3 font-medium">Device enrolled</p>
                <p className="mt-1 text-xs text-muted">
                  Token used {shortDate(enroll.consumedAt)}
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center">
                <div className="rounded-xl2 border border-line bg-white p-4">
                  <QRCodeSVG
                    value={JSON.stringify(enroll.qr)}
                    size={200}
                    level="M"
                    marginSize={0}
                  />
                </div>
                <p className="mt-4 text-center text-xs text-muted">
                  On a new device: tap the setup screen 6× to open the QR scanner,
                  then scan. It provisions and enrolls automatically.
                </p>
                <p className="mt-3 w-full break-all rounded-xl bg-canvas p-3 text-center font-mono text-2xs text-muted">
                  {enroll.enrollmentToken}
                </p>
                <p className="mt-2 text-2xs text-faint">
                  Expires {shortDate(enroll.expiresAt)}
                </p>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Command history + events */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Command history" />
          <div className="space-y-2 p-5">
            {!commands || commands.length === 0 ? (
              <EmptyState title="No commands" />
            ) : (
              commands.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between rounded-xl bg-canvas px-4 py-2.5 text-sm"
                >
                  <div>
                    <span className="font-medium">{c.type}</span>
                    {c.reason && <span className="ml-2 text-muted">· {c.reason}</span>}
                  </div>
                  <StatusPill status={c.status} />
                </div>
              ))
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Audit timeline" />
          <div className="space-y-2 p-5">
            {!device.events || device.events.length === 0 ? (
              <EmptyState title="No events" />
            ) : (
              device.events.map((e) => (
                <div key={e.id} className="flex items-center justify-between text-sm">
                  <span className="font-medium">{e.type.replace(/_/g, ' ')}</span>
                  <span className="text-muted">{shortDate(e.createdAt)}</span>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 font-medium">{value}</dd>
    </div>
  );
}
