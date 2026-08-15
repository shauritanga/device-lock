import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  MessageCircle,
  MessageSquare,
  Phone,
} from 'lucide-react';
import { api } from '@/shared/api/client';
import { Card, CardHeader } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { StatusPill } from '@/shared/components/ui/Pill';
import { Center, EmptyState, Spinner } from '@/shared/components/ui/misc';
import { Field, Input } from '@/shared/components/ui/Field';
import { money, shortDate } from '@/shared/lib/format';

type CaseDetail = {
  id: string;
  companyName: string | null;
  customerId: string;
  customerName: string | null;
  customerPhone: string | null;
  isRepeatCustomer: boolean;
  deviceImei: string | null;
  deviceModel: string | null;
  deviceStatus: string | null;
  daysOverdue: number;
  amountDue: string | number;
  currency: string;
  status: string;
  followUpCount: number;
  dueDate?: string | null;
  assignedTo?: { fullName: string; phone?: string | null } | null;
  idCardPhotoUrl: string | null;
  selfiePhotoUrl: string | null;
  occupation: string | null;
  employerName: string | null;
  employerPhone: string | null;
  monthlyIncome: string | number | null;
  extensionApplied: boolean;
  penaltyInterestReductionEnabled: boolean;
  penaltyInterestAmount: string | number;
  waiverValidUntil: string | null;
  originalOverdueAmount: string | number | null;
  repayments: Array<{
    id: string;
    orderReference: string;
    receivedAt: string;
    amount: string | number;
    classification: 'FULL' | 'PARTIAL';
    daysEarly: number | null;
  }>;
  timeline: Array<{
    id: string;
    channel: string;
    status: string;
    verificationStatus: string;
    body?: string | null;
    durationSeconds?: number | null;
    occurredAt: string;
    collector?: { fullName: string } | null;
  }>;
  promises: Array<{
    id: string;
    promisedAmount: string | number;
    dueDate: string;
    status: string;
    notes?: string | null;
    createdBy?: { fullName: string } | null;
  }>;
  sessions: Array<{
    id: string;
    channel: string;
    status: string;
    verificationStatus: string;
    launchUrl?: string | null;
    initiatedAt: string;
    completedAt?: string | null;
  }>;
};

export default function CollectionCaseDetail() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [smsBody, setSmsBody] = useState(
    'Hello, this is a reminder about your device installment. Please pay today.',
  );
  const [ptpAmount, setPtpAmount] = useState('');
  const [ptpDate, setPtpDate] = useState('');
  const [ptpNotes, setPtpNotes] = useState('');
  const [lastLaunch, setLastLaunch] = useState<string | null>(null);
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);
  const [outcomeNote, setOutcomeNote] = useState('');
  const [durationSec, setDurationSec] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['collections', 'case', id],
    queryFn: async () =>
      (await api.get<CaseDetail>(`/collections/cases/${id}`)).data,
    enabled: Boolean(id),
  });

  const startContact = useMutation({
    mutationFn: async (channel: 'CALL' | 'SMS' | 'WHATSAPP') => {
      const body =
        channel === 'CALL'
          ? undefined
          : channel === 'SMS'
            ? smsBody
            : smsBody;
      return (
        await api.post(`/collections/cases/${id}/contact-sessions`, {
          channel,
          body,
        })
      ).data as {
        session: { id: string; verificationStatus: string };
        launchUrl: string;
        verificationNote: string;
      };
    },
    onSuccess: (res) => {
      setLastLaunch(res.launchUrl);
      setPendingSessionId(res.session.id);
      if (res.launchUrl) {
        window.open(res.launchUrl, '_blank', 'noopener,noreferrer');
      }
      qc.invalidateQueries({ queryKey: ['collections', 'case', id] });
    },
  });

  const complete = useMutation({
    mutationFn: async () => {
      if (!pendingSessionId) throw new Error('No session');
      return (
        await api.post(`/collections/contact-sessions/${pendingSessionId}/complete`, {
          outcomeNote: outcomeNote || undefined,
          durationSeconds: durationSec ? Number(durationSec) : undefined,
          verificationStatus: 'SELF_REPORTED',
        })
      ).data;
    },
    onSuccess: () => {
      setPendingSessionId(null);
      setOutcomeNote('');
      setDurationSec('');
      qc.invalidateQueries({ queryKey: ['collections', 'case', id] });
    },
  });

  const updateKyc = useMutation({
    mutationFn: async (payload: {
      occupation?: string;
      employerName?: string;
      employerPhone?: string;
      monthlyIncome?: number;
    }) =>
      (await api.patch(`/collections/customers/${data!.customerId}`, payload))
        .data,
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['collections', 'case', id] }),
  });

  const uploadKycPhoto = useMutation({
    mutationFn: async (formData: FormData) =>
      (
        await api.post(
          `/collections/customers/${data!.customerId}/kyc-photos`,
          formData,
        )
      ).data,
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['collections', 'case', id] }),
  });

  const setWaiver = useMutation({
    mutationFn: async (payload: {
      extensionApplied?: boolean;
      penaltyInterestReductionEnabled?: boolean;
      penaltyInterestAmount?: number;
      waiverValidUntil?: string | null;
    }) => (await api.patch(`/collections/cases/${id}/waiver`, payload)).data,
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['collections', 'case', id] }),
  });

  function submitKyc(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const income = fd.get('monthlyIncome');
    updateKyc.mutate({
      occupation: (fd.get('occupation') as string) || undefined,
      employerName: (fd.get('employerName') as string) || undefined,
      employerPhone: (fd.get('employerPhone') as string) || undefined,
      monthlyIncome: income ? Number(income) : undefined,
    });
  }

  function pickKycPhoto(field: 'idCard' | 'selfie') {
    return (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const fd = new FormData();
      fd.append(field, file);
      uploadKycPhoto.mutate(fd);
      e.target.value = '';
    };
  }

  function submitWaiver(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const validUntil = fd.get('waiverValidUntil') as string;
    setWaiver.mutate({
      extensionApplied: fd.get('extensionApplied') === 'on',
      penaltyInterestReductionEnabled:
        fd.get('penaltyInterestReductionEnabled') === 'on',
      penaltyInterestAmount: fd.get('penaltyInterestAmount')
        ? Number(fd.get('penaltyInterestAmount'))
        : undefined,
      waiverValidUntil: validUntil ? new Date(validUntil).toISOString() : null,
    });
  }

  const createPtp = useMutation({
    mutationFn: async () =>
      (
        await api.post(`/collections/cases/${id}/promises`, {
          promisedAmount: Number(ptpAmount),
          dueDate: new Date(ptpDate).toISOString(),
          notes: ptpNotes || undefined,
        })
      ).data,
    onSuccess: () => {
      setPtpAmount('');
      setPtpDate('');
      setPtpNotes('');
      qc.invalidateQueries({ queryKey: ['collections', 'case', id] });
    },
  });

  if (isLoading || !data) return <Center><Spinner /></Center>;

  return (
    <div className="space-y-6">
      <Link
        to="/cases"
        className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" /> Back to cases
      </Link>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                Company
              </p>
              <p className="text-lg font-bold">{data.companyName ?? '—'}</p>
              <p className="mt-3 text-xl font-semibold">{data.customerName}</p>
              <p className="text-sm text-muted">{data.customerPhone}</p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <StatusPill status={data.status} />
              <StatusPill
                status={data.isRepeatCustomer ? 'Old customer' : 'New customer'}
              />
            </div>
          </div>
          <dl className="mt-5 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-muted">Amount due</dt>
              <dd className="font-semibold tabular-nums">{money(data.amountDue)}</dd>
            </div>
            <div>
              <dt className="text-muted">Days overdue</dt>
              <dd className="font-semibold tabular-nums">{data.daysOverdue}</dd>
            </div>
            <div>
              <dt className="text-muted">Installment due</dt>
              <dd className="font-semibold">
                {data.dueDate ? shortDate(data.dueDate) : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-muted">Follow-ups</dt>
              <dd className="font-semibold tabular-nums">{data.followUpCount}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-muted">Device</dt>
              <dd className="font-medium">
                {data.deviceImei} · {data.deviceModel || '—'} ·{' '}
                {data.deviceStatus ? (
                  <StatusPill status={data.deviceStatus} />
                ) : null}
              </dd>
            </div>
            <div className="col-span-2">
              <dt className="text-muted">Assigned to</dt>
              <dd>
                {data.assignedTo?.fullName ?? 'Unassigned'}
                {data.assignedTo?.phone ? ` · ${data.assignedTo.phone}` : ''}
              </dd>
            </div>
          </dl>
        </Card>

        <Card>
          <CardHeader
            title="Start contact"
            subtitle="Must start from system — then complete with outcome"
          />
          <div className="space-y-3 p-5">
            <Field label="SMS / WhatsApp message">
              <Input
                value={smsBody}
                onChange={(e) => setSmsBody(e.target.value)}
              />
            </Field>
            <div className="flex flex-col gap-2">
              <Button
                onClick={() => startContact.mutate('CALL')}
                disabled={startContact.isPending}
              >
                <Phone className="h-4 w-4" /> Start call
              </Button>
              <Button
                variant="secondary"
                onClick={() => startContact.mutate('SMS')}
                disabled={startContact.isPending}
              >
                <MessageSquare className="h-4 w-4" /> Start SMS
              </Button>
              <Button
                variant="secondary"
                onClick={() => startContact.mutate('WHATSAPP')}
                disabled={startContact.isPending}
              >
                <MessageCircle className="h-4 w-4" /> Start WhatsApp
              </Button>
            </div>
            {startContact.isError ? (
              <p className="text-sm text-rose-600">
                Could not start contact. Register your phone if calling.
              </p>
            ) : null}
            {lastLaunch ? (
              <p className="break-all rounded-xl bg-canvas p-3 text-xs text-muted">
                Launch:{' '}
                <a className="text-brand-700 underline" href={lastLaunch}>
                  {lastLaunch}
                </a>
              </p>
            ) : null}
            {pendingSessionId ? (
              <div className="space-y-2 rounded-xl border border-brand-200 bg-brand-50 p-3">
                <p className="text-sm font-semibold text-brand-900">
                  Complete session
                </p>
                <Field label="Outcome note">
                  <Input
                    value={outcomeNote}
                    onChange={(e) => setOutcomeNote(e.target.value)}
                    placeholder="No answer / spoke / etc."
                  />
                </Field>
                <Field label="Call duration (seconds)">
                  <Input
                    type="number"
                    value={durationSec}
                    onChange={(e) => setDurationSec(e.target.value)}
                    placeholder="Optional"
                  />
                </Field>
                <Button
                  onClick={() => complete.mutate()}
                  disabled={complete.isPending}
                >
                  {complete.isPending ? 'Saving…' : 'Mark completed'}
                </Button>
                <p className="text-2xs text-muted">
                  Marked SELF_REPORTED until device log / provider verifies.
                </p>
              </div>
            ) : null}
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Communication timeline" subtitle="Call · SMS · WhatsApp" />
          <div className="max-h-96 space-y-2 overflow-y-auto p-5">
            {data.timeline.length === 0 ? (
              <EmptyState title="No contacts yet" hint="Start a call, SMS, or WhatsApp." />
            ) : (
              data.timeline.map((t) => (
                <div
                  key={t.id}
                  className="rounded-xl border border-line bg-canvas/50 px-4 py-3 text-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold">{t.channel}</span>
                    <div className="flex gap-2">
                      <StatusPill status={t.verificationStatus} />
                      <StatusPill status={t.status} />
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {shortDate(t.occurredAt)}
                    {t.collector ? ` · ${t.collector.fullName}` : ''}
                    {t.durationSeconds != null
                      ? ` · ${t.durationSeconds}s`
                      : ''}
                  </p>
                  {t.body ? (
                    <p className="mt-2 whitespace-pre-wrap text-muted">{t.body}</p>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Promise to pay" subtitle="Client payment commitments" />
          <form
            className="space-y-3 border-b border-line p-5"
            onSubmit={(e) => {
              e.preventDefault();
              createPtp.mutate();
            }}
          >
            <div className="grid grid-cols-2 gap-3">
              <Field label="Amount">
                <Input
                  type="number"
                  value={ptpAmount}
                  onChange={(e) => setPtpAmount(e.target.value)}
                  required
                  min={0}
                />
              </Field>
              <Field label="Promised date">
                <Input
                  type="date"
                  value={ptpDate}
                  onChange={(e) => setPtpDate(e.target.value)}
                  required
                />
              </Field>
            </div>
            <Field label="Notes">
              <Input
                value={ptpNotes}
                onChange={(e) => setPtpNotes(e.target.value)}
              />
            </Field>
            <Button type="submit" disabled={createPtp.isPending}>
              {createPtp.isPending ? 'Saving…' : 'Save promise'}
            </Button>
          </form>
          <div className="max-h-64 space-y-2 overflow-y-auto p-5">
            {data.promises.length === 0 ? (
              <EmptyState title="No promises yet" />
            ) : (
              data.promises.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded-xl bg-canvas px-4 py-3 text-sm"
                >
                  <div>
                    <p className="font-semibold tabular-nums">
                      {money(p.promisedAmount)} by {shortDate(p.dueDate)}
                    </p>
                    <p className="text-xs text-muted">
                      {p.createdBy?.fullName ?? '—'}
                      {p.notes ? ` · ${p.notes}` : ''}
                    </p>
                  </div>
                  <StatusPill status={p.status} />
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader
            title="Customer KYC"
            subtitle="Shown on the collector app's Customer Information tab"
          />
          <form key={data.customerId} className="space-y-3 p-5" onSubmit={submitKyc}>
            <Field label="Job / occupation">
              <Input name="occupation" defaultValue={data.occupation ?? ''} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Company name">
                <Input name="employerName" defaultValue={data.employerName ?? ''} />
              </Field>
              <Field label="Company phone">
                <Input name="employerPhone" defaultValue={data.employerPhone ?? ''} />
              </Field>
            </div>
            <Field label="Monthly income">
              <Input
                name="monthlyIncome"
                type="number"
                min={0}
                defaultValue={data.monthlyIncome ?? ''}
              />
            </Field>
            <Button type="submit" disabled={updateKyc.isPending}>
              {updateKyc.isPending ? 'Saving…' : 'Save employment info'}
            </Button>

            <div className="grid grid-cols-2 gap-3 border-t border-line pt-3">
              <div>
                <p className="mb-1.5 text-sm font-medium text-ink">ID card photo</p>
                {data.idCardPhotoUrl ? (
                  <img
                    src={data.idCardPhotoUrl}
                    alt="ID card"
                    className="mb-2 h-24 w-full rounded-lg object-cover"
                  />
                ) : null}
                <input type="file" accept="image/*" onChange={pickKycPhoto('idCard')} />
              </div>
              <div>
                <p className="mb-1.5 text-sm font-medium text-ink">Selfie</p>
                {data.selfiePhotoUrl ? (
                  <img
                    src={data.selfiePhotoUrl}
                    alt="Selfie"
                    className="mb-2 h-24 w-full rounded-lg object-cover"
                  />
                ) : null}
                <input type="file" accept="image/*" onChange={pickKycPhoto('selfie')} />
              </div>
            </div>
          </form>
        </Card>

        <Card>
          <CardHeader
            title="Waiver / extension"
            subtitle="Admin-granted — shown read-only on the collector app"
          />
          <form key={data.id} className="space-y-3 p-5" onSubmit={submitWaiver}>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                name="extensionApplied"
                defaultChecked={data.extensionApplied}
              />
              Extension applied
            </label>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                name="penaltyInterestReductionEnabled"
                defaultChecked={data.penaltyInterestReductionEnabled}
              />
              Penalty interest reduction enabled
            </label>
            <Field label="Penalty interest amount">
              <Input
                name="penaltyInterestAmount"
                type="number"
                min={0}
                defaultValue={data.penaltyInterestAmount ?? 0}
              />
            </Field>
            <Field label="Waiver valid until">
              <Input
                name="waiverValidUntil"
                type="datetime-local"
                defaultValue={
                  data.waiverValidUntil
                    ? data.waiverValidUntil.slice(0, 16)
                    : ''
                }
              />
            </Field>
            <Button type="submit" disabled={setWaiver.isPending}>
              {setWaiver.isPending ? 'Saving…' : 'Save waiver'}
            </Button>
            {data.originalOverdueAmount != null ? (
              <p className="text-2xs text-muted">
                Original overdue amount: {money(data.originalOverdueAmount)} —
                restored if unpaid after the waiver expires.
              </p>
            ) : null}
          </form>
        </Card>

        <Card>
          <CardHeader title="Repayment history" subtitle="Confirmed payments on this loan" />
          <div className="max-h-96 space-y-2 overflow-y-auto p-5">
            {data.repayments.length === 0 ? (
              <EmptyState title="No repayments yet" />
            ) : (
              data.repayments.map((r) => (
                <div
                  key={r.id}
                  className="rounded-xl border border-line bg-canvas/50 px-4 py-3 text-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{r.orderReference}</span>
                    <StatusPill
                      status={r.classification === 'FULL' ? 'Full payment' : 'Partial'}
                    />
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {shortDate(r.receivedAt)} · {money(r.amount)}
                    {r.daysEarly != null
                      ? ` · ${Math.abs(r.daysEarly)} days ${r.daysEarly >= 0 ? 'early' : 'late'}`
                      : ''}
                  </p>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
