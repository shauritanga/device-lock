import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Phone,
  Plus,
  ShieldCheck,
  Smartphone,
  X,
} from '@/shared/icons';
import { api } from '@/shared/api/client';
import { apiErrorMessage } from '@/shared/agreements/apiError';
import { useAuth } from '@/shared/auth/AuthContext';
import { usePageTrail } from '@/shared/layout/PageTrail';
import type { Customer, VerificationChecks, VerificationStatus } from '@/shared/api/types';
import { Button } from '@/shared/components/ui/Button';
import { Card, CardHeader } from '@/shared/components/ui/Card';
import { useConfirm } from '@/shared/components/ui/ConfirmDialog';
import { Field, Input } from '@/shared/components/ui/Field';
import { Modal } from '@/shared/components/ui/Modal';
import { Pill, StatusDot } from '@/shared/components/ui/Pill';
import { Center, EmptyState, Spinner } from '@/shared/components/ui/misc';
import { shortDate } from '@/shared/lib/format';
import { PhoneVerification } from '../components/PhoneVerification';
import {
  GUARDIAN_FORM_ID,
  GuardiansStep,
  idTypeLabel,
  REQUIRED_GUARDIANS,
  type GuardianStatus,
} from '../components/customer';

const TONE = { VERIFIED: 'green', NEEDS_REVIEW: 'amber', FAILED: 'red', UNVERIFIED: 'gray' } as const;
const LABEL: Record<VerificationStatus, string> = {
  VERIFIED: 'Verified',
  NEEDS_REVIEW: 'Needs review',
  FAILED: 'Failed',
  UNVERIFIED: 'Not verified',
};

type CheckRow = { label: string; ok: boolean | null; note?: string | null };

function checkRows(c?: VerificationChecks | null): CheckRow[] {
  if (!c) {
    return [
      'ID number is valid',
      'ID is not used by another customer',
      'ID front, ID back and selfie on file',
      'Live person (blinked on camera)',
      'Face matches the ID photo',
    ].map((label) => ({ label, ok: null }));
  }
  return [
    { label: 'ID number is valid', ok: c.idFormat.passed, note: c.idFormat.reason },
    {
      label: 'ID is not used by another customer',
      ok: c.duplicateId.passed,
      note: c.duplicateId.matches ? `Already registered to ${c.duplicateId.matches}` : null,
    },
    { label: 'ID front, ID back and selfie on file', ok: c.photos.passed },
    {
      label: 'Live person (blinked on camera)',
      ok: c.liveness.passed,
      note: c.liveness.info
        ? `${c.liveness.info.fps} frames/s, face seen in ${c.liveness.info.faceFrames} of ${c.liveness.info.frames} frames, ${c.liveness.info.attempts} attempt(s)`
        : null,
    },
    {
      label: 'Face matches the ID photo',
      ok: c.face.passed,
      note: `Distance ${c.face.distance.toFixed(2)} (match below ${c.face.matchBelow})`,
    },
  ];
}

/** One customer: who they are, whether their identity is verified, their guardians and phones. */
export default function CustomerDetail() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const role = useAuth().user?.role;
  const canReview = role === 'OWNER' || role === 'MANAGER';
  const { confirm, dialog } = useConfirm();
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [guardiansOpen, setGuardiansOpen] = useState(false);
  const [gStatus, setGStatus] = useState<GuardianStatus>({ done: false, pending: false });
  const [photo, setPhoto] = useState<{ src: string; label: string } | null>(null);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const { data: c, isLoading } = useQuery({
    queryKey: ['customer', id],
    queryFn: async () => (await api.get<Customer>(`/customers/${id}`)).data,
  });

  usePageTrail([{ label: 'Customers', to: '/customers' }, { label: c?.fullName ?? 'Customer' }]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['customer', id] });
    qc.invalidateQueries({ queryKey: ['customers'] });
  };

  const review = useMutation({
    mutationFn: async (decision: 'VERIFIED' | 'FAILED') =>
      (await api.post<Customer>(`/customers/${id}/review`, { decision, notes })).data,
    onSuccess: () => {
      setNotes('');
      setError('');
      refresh();
    },
    onError: (e) => setError(apiErrorMessage(e)),
  });

  if (isLoading || !c) {
    return (
      <Center>
        <Spinner />
      </Center>
    );
  }

  const status = c.verificationStatus ?? 'UNVERIFIED';
  const checks = checkRows(c.verificationChecks);
  const guardians = c.guardians ?? [];
  const failedChecks = checks.filter((r) => r.ok === false);
  const photos = [
    { src: c.idCardPhotoUrl, label: 'ID front' },
    { src: c.idCardBackPhotoUrl, label: 'ID back' },
    { src: c.selfiePhotoUrl, label: 'Live selfie' },
  ];
  const initials = c.fullName
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="space-y-5">
      {dialog}

      {/* Who they are, and what to do next */}
      <Card>
        <div className="flex flex-wrap items-center gap-4 p-5 sm:p-6">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand-100 text-lg font-semibold text-brand-700">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="truncate text-xl font-bold tracking-tight">{c.fullName}</h2>
              <Pill tone={TONE[status]}>{LABEL[status]}</Pill>
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
              <span className="inline-flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5" /> {c.phone}
              </span>
              <span>Registered {shortDate(c.createdAt)}</span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {status !== 'VERIFIED' ? (
              <Button onClick={() => setVerifyOpen(true)}>
                <ShieldCheck className="h-4 w-4" /> Verify identity
              </Button>
            ) : null}
            {guardians.length < REQUIRED_GUARDIANS ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setGStatus({ done: false, pending: false });
                  setGuardiansOpen(true);
                }}
              >
                <Plus className="h-4 w-4" /> Add guardians
              </Button>
            ) : null}
          </div>
        </div>

        {status === 'VERIFIED' ? (
          <p className="flex items-center gap-2 border-t border-line-soft bg-emerald-500/5 px-5 py-3 text-sm text-emerald-700 sm:px-6">
            <CheckCircle2 className="h-4 w-4" /> Verified{c.verifiedAt ? ` on ${shortDate(c.verifiedAt)}` : ''}. This
            customer can buy on credit
            {guardians.length < REQUIRED_GUARDIANS ? ' once all three guardians are added.' : '.'}
          </p>
        ) : status === 'NEEDS_REVIEW' ? (
          <p className="flex items-center gap-2 border-t border-line-soft bg-amber-500/5 px-5 py-3 text-sm text-amber-700 sm:px-6">
            <AlertCircle className="h-4 w-4" /> The automatic checks could not decide. A manager needs to review the
            photos below.
          </p>
        ) : status === 'FAILED' ? (
          <p className="flex items-center gap-2 border-t border-line-soft bg-rose-500/5 px-5 py-3 text-sm text-rose-700 sm:px-6">
            <AlertCircle className="h-4 w-4" /> Verification failed
            {failedChecks.length ? `: ${failedChecks.map((r) => r.label.toLowerCase()).join(', ')}` : ''}.
          </p>
        ) : (
          <p className="border-t border-line-soft px-5 py-3 text-sm text-muted sm:px-6">
            This customer cannot buy on credit until their identity is verified.
          </p>
        )}
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {/* Identity */}
          <Card>
            <CardHeader title="Identity verification" subtitle="Checked on a phone with the ID card and a live selfie" />
            <ul className="mt-4 divide-y divide-line-soft border-t border-line-soft">
              {checks.map((r) => (
                <li key={r.label} className="flex items-start gap-3 px-5 py-3 sm:px-6">
                  <span
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                      r.ok === null
                        ? 'bg-slate-500/10 text-slate-400'
                        : r.ok
                          ? 'bg-emerald-500/15 text-emerald-600'
                          : 'bg-rose-500/15 text-rose-600'
                    }`}
                  >
                    {r.ok === null ? (
                      <span className="h-1.5 w-1.5 rounded-full bg-current" />
                    ) : r.ok ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      <X className="h-3 w-3" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-ink">{r.label}</p>
                    {r.note ? <p className="mt-0.5 text-xs text-muted">{r.note}</p> : null}
                  </div>
                  <span className="shrink-0 text-xs text-faint">
                    {r.ok === null ? 'Not checked' : r.ok ? 'Passed' : 'Failed'}
                  </span>
                </li>
              ))}
            </ul>

            <div className="border-t border-line-soft px-5 py-5 sm:px-6">
              <p className="mb-3 text-[10.5px] font-semibold uppercase tracking-[0.6px] text-faint">Photos</p>
              {photos.some((p) => p.src) ? (
                <div className="grid grid-cols-3 gap-3">
                  {photos.map((p) => (
                    <figure key={p.label}>
                      {p.src ? (
                        <button
                          type="button"
                          onClick={() => setPhoto({ src: p.src!, label: p.label })}
                          className="block w-full overflow-hidden rounded-xl border border-line"
                          aria-label={`View ${p.label}`}
                        >
                          <img src={p.src} alt={p.label} className="aspect-[4/3] w-full object-cover" />
                        </button>
                      ) : (
                        <div className="flex aspect-[4/3] w-full items-center justify-center rounded-xl border border-dashed border-line text-xs text-faint">
                          Missing
                        </div>
                      )}
                      <figcaption className="mt-1.5 text-xs text-muted">{p.label}</figcaption>
                    </figure>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted">
                  No photos yet. Start verification to photograph the ID and take a live selfie.
                </p>
              )}
            </div>

            {canReview && (status === 'NEEDS_REVIEW' || status === 'FAILED') ? (
              <div className="space-y-3 border-t border-line-soft px-5 py-5 sm:px-6">
                <div>
                  <p className="text-sm font-medium text-ink">Manager decision</p>
                  <p className="mt-0.5 text-xs text-muted">
                    Compare the photos above, or use this after meeting the customer. Your note is saved.
                  </p>
                </div>
                {error ? <p className="text-sm text-rose-600">{error}</p> : null}
                <Field label="Note">
                  <Input
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Why you approved or rejected"
                  />
                </Field>
                <div className="flex gap-2">
                  <Button
                    disabled={review.isPending || !notes.trim()}
                    onClick={async () => {
                      if (
                        await confirm({
                          title: `Approve ${c.fullName}?`,
                          message: 'They will be marked verified and can buy on credit. Your note is saved with the decision.',
                          confirmLabel: 'Approve',
                        })
                      )
                        review.mutate('VERIFIED');
                    }}
                  >
                    Approve
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={review.isPending || !notes.trim()}
                    onClick={async () => {
                      if (
                        await confirm({
                          title: `Reject ${c.fullName}?`,
                          message: 'They will be marked as failed and cannot buy on credit until they are verified again.',
                          confirmLabel: 'Reject',
                          danger: true,
                        })
                      )
                        review.mutate('FAILED');
                    }}
                  >
                    Reject
                  </Button>
                </div>
              </div>
            ) : null}
            {c.verificationNotes ? (
              <p className="border-t border-line-soft px-5 py-3 text-xs text-muted sm:px-6">
                Manager note: {c.verificationNotes}
              </p>
            ) : null}
          </Card>

          {/* Guardians */}
          <Card>
            <CardHeader
              title="Guardians"
              subtitle={`${guardians.length} of ${REQUIRED_GUARDIANS} added. Three are needed before a sale.`}
            />
            {guardians.length === 0 ? (
              <div className="p-5">
                <EmptyState title="No guardians yet" hint="Guardians are people who vouch for the customer." />
              </div>
            ) : (
              <ul className="mt-4 divide-y divide-line-soft border-t border-line-soft">
                {guardians.map((g) => (
                  <li key={g.id} className="flex items-center gap-3 px-5 py-3 sm:px-6">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-500/10 text-xs font-semibold text-muted">
                      {g.fullName
                        .split(' ')
                        .map((p) => p[0])
                        .slice(0, 2)
                        .join('')
                        .toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">
                        {g.fullName} <span className="font-normal text-muted">· {g.relationship}</span>
                      </p>
                      <p className="truncate text-xs text-muted">{g.address}</p>
                    </div>
                    <span className="shrink-0 text-sm tabular-nums text-muted">{g.phone}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Details" />
            <dl className="mt-4 space-y-3.5 border-t border-line-soft px-5 py-4 text-sm sm:px-6">
              <Row label="Phone" value={c.phone} />
              <Row label="ID type" value={c.nationalId ? idTypeLabel(c.idDocumentType) : '—'} />
              <Row label="ID number" value={c.nationalId ?? '—'} />
              <Row label="Address" value={c.address ?? '—'} />
              <Row label="Registered" value={shortDate(c.createdAt)} />
            </dl>
          </Card>

          <Card>
            <CardHeader title="Phones" subtitle="Bought on credit" />
            {c.devices && c.devices.length > 0 ? (
              <ul className="mt-4 divide-y divide-line-soft border-t border-line-soft">
                {c.devices.map((d) => (
                  <li key={d.id}>
                    <Link
                      to={`/devices/${d.id}`}
                      className="flex items-center gap-3 px-5 py-3 text-sm transition hover:bg-canvas/60 sm:px-6"
                    >
                      <Smartphone className="h-4 w-4 shrink-0 text-muted" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate tabular-nums text-ink">{d.imei}</span>
                        <span className="block truncate text-xs text-muted">
                          {[d.make, d.model].filter(Boolean).join(' ') || 'Model not set'}
                        </span>
                      </span>
                      <StatusDot status={d.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 pb-5 pt-3 text-sm text-muted sm:px-6">No phones yet.</p>
            )}
          </Card>
        </div>
      </div>

      <Modal
        open={verifyOpen}
        onClose={() => setVerifyOpen(false)}
        title="Verify identity"
        subtitle={c.fullName}
        size="sm"
        footer={
          <Button variant="secondary" onClick={() => setVerifyOpen(false)}>
            Close
          </Button>
        }
      >
        <PhoneVerification customer={c} onComplete={refresh} />
      </Modal>

      <Modal
        open={guardiansOpen}
        onClose={() => setGuardiansOpen(false)}
        title="Add guardians"
        subtitle={c.fullName}
        size="md"
        footer={
          gStatus.done ? (
            <Button onClick={() => setGuardiansOpen(false)}>Done</Button>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setGuardiansOpen(false)}>
                Close
              </Button>
              <Button type="submit" form={GUARDIAN_FORM_ID} disabled={gStatus.pending}>
                {gStatus.pending ? 'Saving…' : 'Save and continue'}
              </Button>
            </>
          )
        }
      >
        {guardiansOpen ? <GuardiansStep customer={c} onSaved={refresh} onStatus={setGStatus} /> : null}
      </Modal>

      <Modal open={!!photo} onClose={() => setPhoto(null)} title={photo?.label ?? ''} size="lg">
        {photo ? <img src={photo.src} alt={photo.label} className="w-full rounded-xl" /> : null}
      </Modal>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 break-words text-right text-ink">{value}</dd>
    </div>
  );
}
