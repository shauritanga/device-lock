import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { AlertCircle, Lock, LockOpen } from 'lucide-react';
import { api } from '@/shared/api/client';
import { Button } from '@/shared/components/ui/Button';
import { Modal } from '@/shared/components/ui/Modal';
import { cn } from '@/shared/lib/cn';

export type LockTarget = {
  id: string;
  imei: string;
  model?: string | null;
  customerName?: string | null;
  company?: string | null;
  status: string;
};

const REASONS = {
  LOCK: ['Overdue payment', 'Customer unreachable', 'Suspected fraud', 'SIM swapped'],
  UNLOCK: ['Payment received', 'Promise to pay agreed', 'Locked by mistake'],
} as const;

/** True when an admin can usefully lock / unlock a phone in this state. */
export const canLock = (status: string) => status === 'ACTIVE';
export const canUnlock = (status: string) => status === 'LOCKED';

function errorText(e: unknown) {
  if (axios.isAxiosError(e)) {
    const m = e.response?.data?.message;
    if (Array.isArray(m)) return m.join(', ');
    if (typeof m === 'string') return m;
  }
  return 'Could not send the command. Try again.';
}

/** Confirm dialog for a platform admin to lock or unlock a customer's phone. The reason is mandatory and audited. */
export function DeviceLockDialog({
  device,
  action,
  onClose,
}: {
  device: LockTarget | null;
  action: 'LOCK' | 'UNLOCK';
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [reason, setReason] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    setReason('');
    setDone(false);
  }, [device?.id, action]);

  const send = useMutation({
    mutationFn: async () =>
      api.post(`/devices/${device!.id}/${action === 'LOCK' ? 'lock' : 'unlock'}`, {
        reason: reason.trim(),
      }),
    onSuccess: () => {
      setDone(true);
      qc.invalidateQueries({ queryKey: ['admin-devices'] });
      qc.invalidateQueries({ queryKey: ['collections'] });
    },
  });

  const isLock = action === 'LOCK';
  const valid = reason.trim().length >= 3;

  return (
    <Modal
      open={!!device}
      onClose={() => !send.isPending && onClose()}
      title={isLock ? 'Lock this phone?' : 'Unlock this phone?'}
    >
      {device ? (
        done ? (
          <div className="space-y-4">
            <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              {isLock ? 'Lock' : 'Unlock'} command sent. The phone applies it right away if it
              is online, or at its next check-in. The status updates once the phone confirms.
            </p>
            <div className="flex justify-end">
              <Button onClick={onClose}>Done</Button>
            </div>
          </div>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (valid) send.mutate();
            }}
          >
            <div className="rounded-xl bg-canvas p-3 text-sm">
              <p className="font-semibold">{device.customerName ?? 'Customer'}</p>
              <p className="text-muted">
                {device.imei}
                {device.model ? ` · ${device.model}` : ''}
              </p>
              {device.company ? <p className="text-muted">{device.company}</p> : null}
            </div>
            <p className="text-sm text-muted">
              {isLock
                ? 'The customer will see the payment screen and only emergency calls will work. The seller can see that you did this.'
                : 'The phone returns to normal use. The seller can see that you did this.'}
            </p>
            <div>
              <span className="mb-1.5 block text-sm font-medium text-ink">
                Reason <span className="text-rose-600">*</span>
              </span>
              <div className="mb-2 flex flex-wrap gap-2">
                {REASONS[action].map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setReason(r)}
                    className={cn(
                      'rounded-full border px-3 py-1 text-xs transition',
                      reason === r
                        ? 'border-brand-500 bg-brand-50 font-medium text-brand-800'
                        : 'border-line bg-surface text-ink hover:bg-canvas',
                    )}
                  >
                    {r}
                  </button>
                ))}
              </div>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                placeholder="Why are you doing this?"
                className="w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm text-ink outline-none transition placeholder:text-faint focus:border-brand-400 focus:ring-4 focus:ring-brand-100"
              />
            </div>
            {send.isError ? (
              <p className="flex items-start gap-2 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                {errorText(send.error)}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={onClose} disabled={send.isPending}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant={isLock ? 'danger' : 'primary'}
                disabled={!valid || send.isPending}
              >
                {isLock ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}
                {send.isPending ? 'Sending…' : isLock ? 'Lock phone' : 'Unlock phone'}
              </Button>
            </div>
          </form>
        )
      ) : null}
    </Modal>
  );
}

/** Lock or Unlock button pair that opens the dialog; renders nothing if neither applies. */
export function DeviceLockActions({
  device,
  onAction,
}: {
  device: LockTarget;
  onAction: (a: 'LOCK' | 'UNLOCK') => void;
}) {
  return (
    <>
      {canLock(device.status) ? (
        <Button type="button" variant="danger" onClick={() => onAction('LOCK')}>
          <Lock className="h-4 w-4" /> Lock phone
        </Button>
      ) : null}
      {canUnlock(device.status) ? (
        <Button type="button" onClick={() => onAction('UNLOCK')}>
          <LockOpen className="h-4 w-4" /> Unlock phone
        </Button>
      ) : null}
    </>
  );
}
