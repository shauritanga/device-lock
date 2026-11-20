import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { usePageTrail } from '@/shared/layout/PageTrail';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { QRCodeSVG } from 'qrcode.react';
import {
  CheckCircle2,
  KeyRound,
  Loader2,
  Lock,
  RefreshCw,
  ShieldAlert,
  Trash2,
  Unlock,
  X,
  XCircle,
} from '@/shared/icons';
import { api } from '@/shared/api/client';
import { useAuth } from '@/shared/auth/AuthContext';
import type { Device, DeviceCommand } from '@/shared/api/types';
import { Card, CardHeader } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Modal } from '@/shared/components/ui/Modal';
import { Center, EmptyState, Spinner } from '@/shared/components/ui/misc';
import { ago, isStale, shortDate } from '@/shared/lib/format';
import { useConfirm } from '@/shared/components/ui/ConfirmDialog';

type EnrollmentPayload = {
  enrollmentToken: string;
  expiresAt: string;
  consumedAt?: string | null;
  qr: Record<string, unknown>;
};

type Feedback = { action: 'Lock' | 'Unlock'; ok: boolean; detail: string } | null;

const STATUS_DOT: Record<string, string> = {
  ACTIVE: 'bg-emerald-500',
  LOCKED: 'bg-rose-500',
  PENDING_ENROLLMENT: 'bg-amber-500',
  RELEASED: 'bg-slate-400',
  DEFAULTED: 'bg-orange-500',
  WIPED: 'bg-slate-700',
};

export default function DeviceDetail() {
  const { confirm, dialog } = useConfirm();
  const { id } = useParams<{ id: string }>();
  // Sales agents get the enrollment QR for phones they sold, never device controls.
  const isAgent = useAuth().user?.role === 'AGENT';
  const isOwner = useAuth().user?.role === 'OWNER';
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmRelease, setConfirmRelease] = useState(false);
  // Owner-only: free a phone whose loan is not fully paid (write-off, or resetting a test phone).
  const [forceRelease, setForceRelease] = useState(false);

  const { data: device, isLoading } = useQuery({
    queryKey: ['device', id],
    queryFn: async () => (await api.get<Device>(`/devices/${id}`)).data,
    refetchInterval: 3_000,
  });
  // Polled only to surface a pending lock/unlock — no history is shown.
  const { data: commands } = useQuery({
    queryKey: ['device', id, 'commands'],
    queryFn: async () => (await api.get<DeviceCommand[]>(`/devices/${id}/commands`)).data,
    refetchInterval: 3_000,
    enabled: !isAgent,
  });
  const { data: enroll } = useQuery({
    queryKey: ['device', id, 'qr'],
    queryFn: async () => (await api.get<EnrollmentPayload>(`/devices/${id}/qr`)).data,
    retry: false,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const regenerate = useMutation({
    mutationFn: async () => (await api.post(`/devices/${id}/enrollment-token`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['device', id, 'qr'] });
      qc.invalidateQueries({ queryKey: ['device', id] });
    },
  });

  const refreshDevice = () => {
    qc.invalidateQueries({ queryKey: ['device', id] });
    qc.invalidateQueries({ queryKey: ['device', id, 'commands'] });
  };

  const lock = useMutation({
    mutationFn: async () =>
      (await api.post(`/devices/${id}/lock`, { reason: 'manual lock from console' })).data,
    onMutate: () => setFeedback(null),
    onSuccess: () => {
      setFeedback({
        action: 'Lock',
        ok: true,
        detail: 'Command sent. The phone locks on its next check-in.',
      });
      refreshDevice();
    },
    onError: (e) => {
      setFeedback({ action: 'Lock', ok: false, detail: errorDetail(e) });
      refreshDevice();
    },
  });
  const unlock = useMutation({
    mutationFn: async () =>
      (await api.post(`/devices/${id}/unlock`, { reason: 'manual unlock from console' })).data,
    onMutate: () => setFeedback(null),
    onSuccess: () => {
      setFeedback({
        action: 'Unlock',
        ok: true,
        detail: 'Command sent. The phone unlocks on its next check-in.',
      });
      refreshDevice();
    },
    onError: (e) => {
      setFeedback({ action: 'Unlock', ok: false, detail: errorDetail(e) });
      refreshDevice();
    },
  });
  const release = useMutation({
    mutationFn: async () =>
      (await api.post(`/devices/${id}/release`, forceRelease ? { force: true } : {})).data,
    onSuccess: () => {
      setConfirmRelease(false);
      refreshDevice();
    },
  });
  const del = useMutation({
    mutationFn: async () => (await api.delete(`/devices/${id}`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['devices'] });
      navigate('/devices');
    },
  });
  const approveSim = useMutation({
    mutationFn: async () =>
      (await api.post(`/devices/${id}/approve-sim-change`, {
        reason: 'approved from device detail page',
      })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['device', id] }),
  });

  usePageTrail([
    isAgent ? { label: 'Sales', to: '/sales' } : { label: 'Devices', to: '/devices' },
    { label: device ? `${device.make ?? ''} ${device.model ?? ''}`.trim() || `IMEI ${device.imei}` : 'Device' },
  ]);

  if (isLoading || !device) return <Center><Spinner /></Center>;
  const managementWarning = device.events?.find((e) => e.type === 'MANAGEMENT_HEALTH_WARNING');
  const simWarning = device.events?.find((e) => e.type === 'SIM_CHANGED');
  const simNeedsApproval = Boolean(
    device.simFingerprint && device.approvedSimFingerprint && device.simFingerprint !== device.approvedSimFingerprint,
  );

  const pendingCmd = (commands ?? []).find(
    (c) =>
      (c.type === 'LOCK' || c.type === 'UNLOCK') &&
      (c.status === 'QUEUED' || c.status === 'SENT'),
  );
  const releaseCmds = (commands ?? [])
    .filter((c) => c.type === 'RELEASE')
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  const releaseWaiting = releaseCmds.find((c) => c.status === 'QUEUED' || c.status === 'SENT');
  const releaseFailed = !releaseWaiting && ['FAILED', 'EXPIRED'].includes(releaseCmds[0]?.status ?? '');
  const loanPaid = device.loan?.status === 'COMPLETED';
  const releasable = !['RELEASED', 'PENDING_ENROLLMENT', 'WIPED'].includes(device.status);
  const busy = lock.isPending || unlock.isPending;
  const canLock = device.status === 'ACTIVE' || device.status === 'DEFAULTED';
  const canUnlock = device.status === 'LOCKED';

  return (
    <div className="space-y-6">
      {dialog}
      <div className="flex items-center justify-end gap-3">
        {!isAgent && device.status === 'PENDING_ENROLLMENT' ? (
          <Button
            variant="ghost"
            className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
            onClick={() => {
              del.reset();
              setConfirmDelete(true);
            }}
          >
            <Trash2 className="h-4 w-4" /> Delete device
          </Button>
        ) : null}
      </div>

      {device.dormantSince ? (
        <Card className="border-amber-200 bg-amber-50 p-4">
          <div className="flex gap-3 text-amber-800">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold">Held for {device.customer?.fullName ?? 'the customer'}'s next loan</p>
              <p className="mt-1 text-sm">
                The loan was repaid on {shortDate(device.dormantSince)}. The phone is unlocked and has no restrictions,
                and stays enrolled so a new loan can start without resetting it. It is released automatically if no new
                loan starts in time, or you can release it now.
              </p>
            </div>
          </div>
        </Card>
      ) : null}

      {managementWarning ? (
        <Card className="border-amber-200 bg-amber-50 p-4">
          <div className="flex gap-3 text-amber-800">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold">Device is enrolled but not fully controlled</p>
              <p className="mt-1 text-sm">
                The app reported that it is not Device Owner or managed restrictions are missing.
                Re-enroll this phone through QR/factory setup before handing it to a customer.
              </p>
            </div>
          </div>
        </Card>
      ) : null}

      {!isAgent && simWarning && simNeedsApproval ? (
        <Card className="border-rose-200 bg-rose-50 p-4">
          <div className="flex flex-col gap-3 text-rose-800 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex gap-3">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-semibold">SIM change detected</p>
                <p className="mt-1 text-sm">
                  The phone reported a SIM that does not match the approved baseline. Review with the customer before approving replacement.
                </p>
              </div>
            </div>
            <Button variant="secondary" onClick={async () => {
                if (
                  await confirm({
                    title: 'Approve the new SIM?',
                    message: 'The phone will accept this SIM as the customer\'s own. Only approve it after checking with the customer.',
                    confirmLabel: 'Approve SIM',
                  })
                )
                  approveSim.mutate();
              }} disabled={approveSim.isPending}>
              Approve SIM
            </Button>
          </div>
        </Card>
      ) : null}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6">
          <div>
            <p className="text-xs text-muted">
              {`${device.make ?? 'Device'} ${device.model ?? ''}`.trim()} · IMEI {device.imei}
            </p>
            <div className="mt-1.5 flex items-center gap-2.5">
              <span
                className={`h-3 w-3 shrink-0 rounded-full ${STATUS_DOT[device.status] ?? 'bg-slate-400'}`}
              />
              <span className="text-xl font-bold tracking-tight">
                {statusLabel(device.status)}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted">{statusDetail(device)}</p>
          </div>
          <div className={isAgent ? 'hidden' : 'flex gap-2'}>
            <Button
              variant="danger"
              onClick={async () => {
                if (
                  await confirm({
                    title: 'Lock this phone?',
                    message: 'The customer will only see the payment screen, and only emergency calls will work, until the phone is unlocked.',
                    confirmLabel: 'Lock phone',
                    danger: true,
                  })
                )
                  lock.mutate();
              }}
              disabled={busy || !canLock}
              title={canLock ? 'Lock this phone now' : 'Only an active phone can be locked'}
            >
              {lock.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Lock className="h-4 w-4" />
              )}
              {lock.isPending ? 'Sending…' : 'Lock'}
            </Button>
            <Button
              variant="secondary"
              onClick={async () => {
                if (
                  await confirm({
                    title: 'Unlock this phone?',
                    message: 'The phone returns to normal use for the customer.',
                    confirmLabel: 'Unlock phone',
                  })
                )
                  unlock.mutate();
              }}
              disabled={busy || !canUnlock}
              title={canUnlock ? 'Unlock this phone now' : 'Only a locked phone can be unlocked'}
            >
              {unlock.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Unlock className="h-4 w-4" />
              )}
              {unlock.isPending ? 'Sending…' : 'Unlock'}
            </Button>
          </div>
        </div>

        {feedback ? (
          <div className="flex items-start gap-3 border-t border-line px-5 py-3.5 text-sm sm:px-6">
            {feedback.ok ? (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            ) : (
              <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
            )}
            <div className="min-w-0 flex-1">
              <p className="font-semibold">
                {feedback.action} {feedback.ok ? 'command sent' : 'command failed'}
              </p>
              <p className="mt-0.5 text-muted">{feedback.detail}</p>
            </div>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="rounded-lg p-1.5 text-muted hover:bg-canvas hover:text-ink"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : pendingCmd ? (
          <div className="flex items-center gap-3 border-t border-line px-5 py-3.5 text-sm sm:px-6">
            <Loader2 className="h-5 w-5 shrink-0 animate-spin text-brand-600" />
            <p className="text-muted">
              <span className="font-semibold text-ink">
                {pendingCmd.type === 'LOCK' ? 'Lock' : 'Unlock'} pending
              </span>{' '}
              — {pendingCmd.status === 'QUEUED' ? 'queued' : 'sent'}, waiting for the
              phone to check in.{' '}
              {isStale(device.lastCheckInAt) ? (
                <span className="font-medium text-amber-700">
                  The Linda app on this phone has not contacted the server for{' '}
                  {ago(device.lastCheckInAt).replace(' ago', '')}, so it cannot receive this
                  command until it does. Having internet is not enough: the app itself must be running.
                </span>
              ) : null}
            </p>
          </div>
        ) : null}
      </Card>

      {device.status === 'RELEASED' ? (
        <Card className="flex items-center gap-3 px-5 py-4 text-sm">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
          <p className="text-muted">
            <span className="font-semibold text-ink">Released.</span> This phone belongs to the
            customer and is no longer managed.
          </p>
        </Card>
      ) : !isAgent && loanPaid && releasable ? (
        <Card className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
          <div className="min-w-0 text-sm">
            <p className="font-semibold text-ink">Loan fully paid</p>
            <p className="mt-0.5 text-muted">
              {releaseWaiting
                ? "Release queued — the phone is released on its next check-in."
                : releaseFailed
                  ? 'The last release attempt did not complete. Try again.'
                  : 'Release the phone to the customer. This removes all management and cannot be undone.'}
            </p>
          </div>
          {releaseWaiting ? (
            <span className="inline-flex items-center gap-2 text-sm text-muted">
              <Loader2 className="h-4 w-4 animate-spin text-brand-600" /> Waiting for the phone
            </span>
          ) : (
            <Button onClick={() => { release.reset(); setForceRelease(false); setConfirmRelease(true); }}>
              <KeyRound className="h-4 w-4" /> {releaseFailed ? 'Retry release' : 'Release phone'}
            </Button>
          )}
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Details" />
          <dl className="grid grid-cols-2 gap-4 p-6 text-sm">
            <Info label="Customer" value={device.customer?.fullName ?? '—'} />
            <Info label="Phone" value={device.customer?.phone ?? '—'} />
            <Info label="Last check-in" value={`${shortDate(device.lastCheckInAt)} · ${ago(device.lastCheckInAt)}`} />
            <Info label="Locked at" value={shortDate(device.lockedAt)} />
            <Info label="Agent app" value={device.agentVersion ?? 'Not reported yet'} />
            <Info
              label="Background running"
              value={
                device.backgroundRestricted
                  ? 'Restricted by the phone'
                  : device.standbyBucket
                    ? `${device.standbyBucket.replace('_', ' ').toLowerCase()}${device.ignoresBatteryOpt ? ' · battery exempt' : ''}`
                    : 'Not reported yet'
              }
            />
            <Info
              label="Loan"
              value={
                device.loan ? (
                  <Link className="text-brand-700 underline" to={`/sales/${device.loan.id}`}>
                    View loan
                  </Link>
                ) : (
                  '—'
                )
              }
            />
          </dl>
        </Card>

        <Card>
          <CardHeader title="SIM protection" subtitle={simNeedsApproval ? 'Replacement pending approval' : 'Approved SIM baseline'} />
          <dl className="grid grid-cols-1 gap-4 p-6 text-sm">
            <Info label="Operator" value={device.simOperator ?? '—'} />
            <Info label="Country" value={device.simCountryIso?.toUpperCase() ?? '—'} />
            <Info label="Phone number" value={device.simPhoneNumber ?? '—'} />
            <Info label="Last changed" value={shortDate(device.simLastChangedAt)} />
            <Info label="Approved at" value={shortDate(device.simChangeApprovedAt)} />
          </dl>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Enrollment"
          subtitle="Scan on a factory-reset device"
          action={isAgent ? undefined : (
            <Button
              variant="ghost"
              onClick={async () => {
                if (
                  await confirm({
                    title: 'Issue a new enrollment token?',
                    message: 'The current QR code stops working and a fresh one is shown. Use this only if the old one expired or was shared by mistake.',
                    confirmLabel: 'Issue new token',
                  })
                )
                  regenerate.mutate();
              }}
              disabled={regenerate.isPending}
              title="Issue a fresh token"
            >
              <RefreshCw className={`h-4 w-4 ${regenerate.isPending ? 'animate-spin' : ''}`} />
            </Button>
          )}
        />
        <div className="p-6">
          {!enroll ? (
            <EmptyState
              title="No active token"
              hint={isAgent ? 'Ask the owner to issue a new one.' : 'Regenerate to issue one.'}
            />
          ) : enroll.consumedAt ? (
            <div className="flex items-center gap-3 py-2">
              <CheckCircle2 className="h-8 w-8 shrink-0 text-emerald-500" />
              <div>
                <p className="font-medium">Device enrolled</p>
                <p className="mt-0.5 text-xs text-muted">
                  Token used {shortDate(enroll.consumedAt)}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
              <div className="mx-auto w-fit shrink-0 rounded-xl2 border border-line bg-white p-4 sm:mx-0">
                <QRCodeSVG
                  value={JSON.stringify(enroll.qr)}
                  size={220}
                  level="M"
                  marginSize={4}
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-ink-soft">
                  On a new device: tap the setup screen 6× to open the QR scanner,
                  then scan. It provisions and enrolls automatically.
                </p>
                <p className="mt-3 rounded-xl2 border border-amber-200 bg-amber-50 px-3 py-2 text-2xs leading-relaxed text-amber-950">
                  Pixel, Samsung, and other phones with Google Play Protect will
                  reject this QR. Google only allows their own Device Policy app
                  as Device Owner on those models. Tecno / Infinix / Itel without
                  that block can still enroll here. Pixel credit sales need
                  Android Device Policy enrollment (we can wire that next).
                </p>
                <p className="mt-3 break-all rounded-xl bg-canvas p-3 text-center font-mono text-2xs text-muted sm:text-left">
                  {enroll.enrollmentToken}
                </p>
                <p className="mt-2 text-2xs text-faint">
                  Expires {shortDate(enroll.expiresAt)}
                </p>
              </div>
            </div>
          )}
        </div>
      </Card>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this device?"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted">
            This permanently removes{' '}
            <span className="font-semibold text-ink">IMEI {device.imei}</span> along
            with its loan schedule, contract, and enrollment token. The customer
            record is kept, and the IMEI is freed so the phone can be registered
            again. This cannot be undone.
          </p>
          {del.isError ? (
            <p className="text-sm text-rose-600">{errorDetail(del.error)}</p>
          ) : null}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setConfirmDelete(false)}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => del.mutate()}
              disabled={del.isPending}
            >
              {del.isPending ? 'Deleting…' : 'Delete device'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={confirmRelease}
        onClose={() => setConfirmRelease(false)}
        title="Release this phone?"
        size="sm"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setConfirmRelease(false)}>
              Cancel
            </Button>
            <Button
              variant={forceRelease ? 'danger' : 'primary'}
              onClick={() => release.mutate()}
              disabled={
                release.isPending ||
                (!forceRelease && !!device.loan && device.loan.status !== 'COMPLETED' && isOwner)
              }
            >
              {release.isPending ? 'Sending…' : forceRelease ? 'Release anyway' : 'Release phone'}
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm text-muted">
          <p>
            <span className="font-semibold text-ink">IMEI {device.imei}</span> will be handed over
            to {device.customer?.fullName ?? 'the customer'} on its next check-in. All
            management, lock control and tracking are removed.
          </p>
          <p>This cannot be undone.</p>
          {isOwner && device.loan && device.loan.status !== 'COMPLETED' ? (
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-rose-400/40 bg-rose-500/5 px-3 py-3 text-ink">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-line accent-rose-600"
                checked={forceRelease}
                onChange={(e) => setForceRelease(e.target.checked)}
              />
              <span>
                The loan is not fully paid. Release it anyway
                <span className="block text-xs text-muted">
                  Only an owner can do this. The customer keeps the phone and you lose all control of it.
                </span>
              </span>
            </label>
          ) : null}
          {release.isError ? <p className="text-rose-600">{errorDetail(release.error)}</p> : null}
        </div>
      </Modal>
    </div>
  );
}

function statusLabel(status: string) {
  switch (status) {
    case 'PENDING_ENROLLMENT':
      return 'Pending enrollment';
    case 'ACTIVE':
      return 'Active';
    case 'LOCKED':
      return 'Locked';
    case 'RELEASED':
      return 'Released';
    case 'DEFAULTED':
      return 'Defaulted';
    case 'WIPED':
      return 'Wiped';
    default:
      return status.replace(/_/g, ' ');
  }
}

function statusDetail(device: Device) {
  const checkIn = `Last check-in ${shortDate(device.lastCheckInAt)}`;
  switch (device.status) {
    case 'ACTIVE':
      return isStale(device.lastCheckInAt)
        ? `Not reporting · the Linda app last contacted the server ${ago(device.lastCheckInAt)}`
        : `Reporting · last contact ${ago(device.lastCheckInAt)}`;
    case 'LOCKED':
      return `Locked ${shortDate(device.lockedAt)} · ${checkIn}`;
    case 'PENDING_ENROLLMENT':
      return 'Waiting for enrollment — scan the QR code below on the phone';
    case 'RELEASED':
      return 'Loan completed — management removed from the phone';
    case 'DEFAULTED':
      return `Written off · ${checkIn}`;
    case 'WIPED':
      return 'Device wiped — management removed';
    default:
      return checkIn;
  }
}

function errorDetail(e: unknown) {
  if (axios.isAxiosError(e)) {
    const message = (e.response?.data as { message?: string })?.message;
    if (message) return Array.isArray(message) ? message.join(', ') : String(message);
  }
  return 'Something went wrong. Check your connection and try again.';
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 font-medium">{value}</dd>
    </div>
  );
}
