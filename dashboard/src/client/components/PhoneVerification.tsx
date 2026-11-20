import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { AlertCircle, Check, CheckCircle2, Loader2, RefreshCw, ShieldCheck } from '@/shared/icons';
import { api } from '@/shared/api/client';
import { apiErrorMessage } from '@/shared/agreements/apiError';
import type { Customer } from '@/shared/api/types';
import { Button } from '@/shared/components/ui/Button';

type SessionStatus = {
  id: string;
  idFront: boolean;
  idBack: boolean;
  completed: boolean;
  cancelled: boolean;
  expired: boolean;
};

/**
 * Verification happens on a phone, never on this computer. This shows a QR code,
 * then follows the phone's progress and shows the result when it finishes.
 */
export function PhoneVerification({
  customer,
  onComplete,
}: {
  customer: Customer;
  onComplete: (c: Customer) => void;
}) {
  const [session, setSession] = useState<{ id: string; url: string } | null>(null);
  const [result, setResult] = useState<Customer | null>(null);

  const start = useMutation({
    mutationFn: async () => {
      const r = (
        await api.post<{ id: string; token: string }>(`/customers/${customer.id}/verification-sessions`)
      ).data;
      return { id: r.id, url: `${window.location.origin}/verify/${r.token}` };
    },
    onSuccess: (s) => {
      setResult(null);
      setSession(s);
    },
  });

  const status = useQuery({
    queryKey: ['verification-session', session?.id],
    enabled: !!session && !result,
    refetchInterval: 2000,
    queryFn: async () =>
      (await api.get<SessionStatus>(`/customers/${customer.id}/verification-sessions/${session!.id}`)).data,
  });

  const s = status.data;
  const finished = !!s?.completed;

  useEffect(() => {
    if (!finished || result) return;
    api.get<Customer>(`/customers/${customer.id}`).then((r) => {
      setResult(r.data);
      onComplete(r.data);
    });
  }, [finished]); // eslint-disable-line react-hooks/exhaustive-deps

  async function cancel() {
    if (session) await api.delete(`/customers/${customer.id}/verification-sessions/${session.id}`).catch(() => {});
    setSession(null);
  }

  if (result) return <Result customer={result} onRetry={() => { setResult(null); setSession(null); }} />;

  if (!session) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted">
          Verification is done on your phone, not on this computer. You will photograph the front and back of the
          ID card, then do a live check with the customer.
        </p>
        {start.isError ? <p className="text-sm text-rose-600">{apiErrorMessage(start.error)}</p> : null}
        <Button onClick={() => start.mutate()} disabled={start.isPending}>
          <ShieldCheck className="h-4 w-4" /> {start.isPending ? 'Preparing…' : 'Start verification'}
        </Button>
      </div>
    );
  }

  if (s?.expired || s?.cancelled) {
    return (
      <div className="space-y-3">
        <p className="flex items-center gap-2 text-sm text-amber-700">
          <AlertCircle className="h-4 w-4" /> This QR code has expired.
        </p>
        <Button onClick={() => start.mutate()} disabled={start.isPending}>
          <RefreshCw className="h-4 w-4" /> New QR code
        </Button>
      </div>
    );
  }

  const phoneStarted = !!s?.idFront;
  const steps: Array<[string, boolean]> = [
    ['ID front', !!s?.idFront],
    ['ID back', !!s?.idBack],
    ['Live check', false],
  ];
  const current = steps.findIndex(([, done]) => !done);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Scan this with your phone's camera and follow the steps there. The code works for 15 minutes.
      </p>
      <div className="flex flex-wrap items-start gap-5">
        <div className="rounded-xl bg-white p-3">
          <QRCodeSVG value={session.url} size={176} />
        </div>
        <ol className="space-y-2.5 text-sm">
          {steps.map(([label, done], i) => (
            <li key={label} className="flex items-center gap-2">
              {done ? (
                <Check className="h-4 w-4 text-emerald-600" />
              ) : i === current && phoneStarted ? (
                <Loader2 className="h-4 w-4 animate-spin text-brand-600" />
              ) : (
                <span className="h-2 w-2 rounded-full bg-line" />
              )}
              <span className={done ? 'text-ink' : 'text-muted'}>{label}</span>
            </li>
          ))}
          <li className="pt-1 text-xs text-faint">
            {phoneStarted ? 'Waiting for the phone…' : 'Waiting for the phone to scan…'}
          </li>
        </ol>
      </div>
      <Button variant="secondary" onClick={cancel}>
        Cancel
      </Button>
    </div>
  );
}

function Result({ customer, onRetry }: { customer: Customer; onRetry: () => void }) {
  const c = customer.verificationChecks;
  const status = customer.verificationStatus ?? 'UNVERIFIED';
  const tone = { VERIFIED: 'text-emerald-600', NEEDS_REVIEW: 'text-amber-600', FAILED: 'text-rose-600', UNVERIFIED: 'text-muted' }[status];
  const rows: Array<[string, boolean | undefined, string?]> = c
    ? [
        ['ID number is valid', c.idFormat.passed, c.idFormat.reason ?? undefined],
        ['ID is not used by another customer', c.duplicateId.passed, c.duplicateId.matches ? `Already registered to ${c.duplicateId.matches}` : undefined],
        ['ID front, ID back and selfie on file', c.photos.passed],
        ['Live person (blinked on camera)', c.liveness.passed, c.liveness.info ? `Detector: ${c.liveness.info.fps} frames/s, face seen in ${c.liveness.info.faceFrames} of ${c.liveness.info.frames} frames, ${c.liveness.info.attempts} attempt(s)` : undefined],
        ['Face matches the ID photo', c.face.passed, `Distance ${c.face.distance.toFixed(2)} (match below ${c.face.matchBelow})`],
      ]
    : [];
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ShieldCheck className={`h-5 w-5 ${tone}`} />
        <span className={`text-sm font-semibold ${tone}`}>
          {status === 'VERIFIED' ? 'Identity verified' : status === 'NEEDS_REVIEW' ? 'Needs a manager to review' : 'Verification failed'}
        </span>
      </div>
      <ul className="space-y-2">
        {rows.map(([label, ok, note]) => (
          <li key={label} className="flex items-start gap-2 text-sm">
            {ok ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            ) : (
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
            )}
            <span className="text-ink">
              {label}
              {note ? <span className="block text-xs text-muted">{note}</span> : null}
            </span>
          </li>
        ))}
      </ul>
      {status !== 'VERIFIED' ? (
        <Button variant="secondary" onClick={onRetry}>
          <RefreshCw className="h-4 w-4" /> Try again
        </Button>
      ) : null}
    </div>
  );
}
