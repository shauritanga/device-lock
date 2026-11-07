import { useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageCircle, MessageSquare, Phone, Plus, Upload } from '@/shared/icons';
import { api } from '@/shared/api/client';
import { Card } from '@/shared/components/ui/Card';
import { FigureStrip } from '@/shared/components/FigureStrip';
import { Modal } from '@/shared/components/ui/Modal';
import { PanelEmpty, PanelHeader } from '@/shared/components/Panel';
import { Row, Table } from '@/shared/components/ui/Table';
import { Tabs } from '@/shared/components/Tabs';
import { usePageTrail } from '@/shared/layout/PageTrail';
import { Button } from '@/shared/components/ui/Button';
import { StatusDot } from '@/shared/components/ui/Pill';
import { Center, Spinner } from '@/shared/components/ui/misc';
import { Field, Input } from '@/shared/components/ui/Field';
import { money, shortDate } from '@/shared/lib/format';
import { useAuth } from '@/shared/auth/AuthContext';
import { PLATFORM_ADMIN_ROLES, roleAllowed } from '@/shared/auth/roles';
import { DeviceLockActions, DeviceLockDialog } from '../components/DeviceLockDialog';

type CaseDetail = {
  id: string;
  companyName: string | null;
  customerId: string;
  customerName: string | null;
  customerPhone: string | null;
  isRepeatCustomer: boolean;
  deviceId?: string | null;
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
  guardians?: Array<{
    id: string;
    fullName: string;
    relationship: string;
    phone: string;
    address: string;
    photoUrl: string;
  }>;
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
    communicationResult?: string | null;
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
  const { user } = useAuth();
  const canLockDevices = roleAllowed(user?.role, PLATFORM_ADMIN_ROLES);
  const [lockAction, setLockAction] = useState<'LOCK' | 'UNLOCK' | null>(null);
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
  const [ptpOpen, setPtpOpen] = useState(false);
  const [params, setParams] = useSearchParams();

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
      setPtpOpen(false);
      qc.invalidateQueries({ queryKey: ['collections', 'case', id] });
    },
  });

  usePageTrail([
    { label: 'Cases', to: '/cases' },
    { label: data?.customerName ?? 'Case' },
  ]);

  if (isLoading || !data) return <Center><Spinner /></Center>;

  const requested = params.get('tab') as CaseTab | null;
  const tab: CaseTab = requested && CASE_TABS.some((t) => t.id === requested) ? requested : 'overview';
  const goTab = (t: CaseTab) => {
    const next = new URLSearchParams(params);
    if (t === 'overview') next.delete('tab');
    else next.set('tab', t);
    setParams(next, { replace: true });
  };
  const nice = (v: string) => v.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase());
  const ptpDirty = !!(ptpAmount || ptpDate || ptpNotes);

  const timelineRows = (rows: CaseDetail['timeline']) =>
    rows.map((t) => (
      <li key={t.id} className="border-b border-line-soft px-5 py-3.5 last:border-b-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-ink">{CHANNEL_LABEL[t.channel] ?? nice(t.channel)}</p>
            <p className="mt-0.5 text-[11.5px] text-muted">
              {shortDate(t.occurredAt)}
              {t.collector ? ` · ${t.collector.fullName}` : ''}
              {t.durationSeconds != null ? ` · ${t.durationSeconds}s` : ''}
              {t.verificationStatus ? ` · ${nice(t.verificationStatus)}` : ''}
            </p>
          </div>
          <StatusDot status={t.communicationResult ?? t.status} />
        </div>
        {t.body ? <p className="mt-2 whitespace-pre-wrap text-[13px] text-muted">{t.body}</p> : null}
      </li>
    ));

  return (
    <div className="space-y-6">
      <Tabs
        label="Case sections"
        tabs={CASE_TABS.map((t) =>
          t.id === 'activity' ? { ...t, count: data.timeline.length } : t,
        )}
        value={tab}
        onChange={goTab}
      />

      {tab === 'overview' ? (
        <>
          <FigureStrip
            items={[
              { label: 'Amount due', value: money(data.amountDue) },
              { label: 'Days overdue', value: data.daysOverdue },
              { label: 'Installment due', value: data.dueDate ? shortDate(data.dueDate) : '—' },
              { label: 'Follow-ups', value: data.followUpCount },
            ]}
          />

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_340px]">
            <Card>
              <PanelHeader title="Case" sub={data.companyName ?? undefined} />
              <dl className="grid grid-cols-2 gap-x-6 gap-y-5 px-5 py-5 md:grid-cols-3">
                <Fact label="Customer">
                  <span className="font-medium">{data.customerName ?? '—'}</span>
                  {data.customerPhone ? (
                    <a href={`tel:${data.customerPhone}`} className="block text-[12px] text-brand-600 hover:underline">
                      {data.customerPhone}
                    </a>
                  ) : null}
                </Fact>
                <Fact label="Customer type">{data.isRepeatCustomer ? 'Returning customer' : 'New customer'}</Fact>
                <Fact label="Case status">
                  <StatusDot status={data.status} />
                </Fact>
                <Fact label="Device">
                  <span className="font-mono text-xs">{data.deviceImei ?? '—'}</span>
                  <span className="block text-[12px] text-muted">{data.deviceModel || 'Model not set'}</span>
                </Fact>
                <Fact label="Device status">
                  {data.deviceStatus ? <StatusDot status={data.deviceStatus} /> : '—'}
                </Fact>
                <Fact label="Assigned to">
                  {data.assignedTo?.fullName ?? 'Unassigned'}
                  {data.assignedTo?.phone ? (
                    <span className="block text-[12px] text-muted">{data.assignedTo.phone}</span>
                  ) : null}
                </Fact>
              </dl>
              {canLockDevices && data.deviceId && data.deviceStatus ? (
                <div className="flex flex-wrap items-center gap-2 border-t border-line-soft px-5 py-3.5">
                  <span className="mr-auto text-xs text-muted">Device control</span>
                  <DeviceLockActions device={lockTarget(data)} onAction={setLockAction} />
                </div>
              ) : null}
            </Card>

            <Card>
              <PanelHeader title="Contact customer" sub="Start here, then log what happened" />
              <div className="space-y-4 px-5 py-5">
                <Field label="Message (SMS / WhatsApp)">
                  <Input value={smsBody} onChange={(e) => setSmsBody(e.target.value)} />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    className="col-span-2"
                    onClick={() => startContact.mutate('CALL')}
                    disabled={startContact.isPending}
                  >
                    <Phone className="h-4 w-4" /> Call customer
                  </Button>
                  <Button variant="secondary" onClick={() => startContact.mutate('SMS')} disabled={startContact.isPending}>
                    <MessageSquare className="h-4 w-4" /> SMS
                  </Button>
                  <Button variant="secondary" onClick={() => startContact.mutate('WHATSAPP')} disabled={startContact.isPending}>
                    <MessageCircle className="h-4 w-4" /> WhatsApp
                  </Button>
                </div>
                {startContact.isError ? (
                  <p className="text-xs text-rose-600 dark:text-rose-400">
                    Could not start contact. Register your phone if calling.
                  </p>
                ) : null}
                {lastLaunch ? (
                  <p className="break-all text-xs text-muted">
                    Launched:{' '}
                    <a className="text-brand-600 underline" href={lastLaunch}>
                      {lastLaunch}
                    </a>
                  </p>
                ) : null}
                {pendingSessionId ? (
                  <div className="space-y-3 rounded-lg border border-line bg-elevated p-3.5">
                    <p className="text-[13px] font-medium text-ink">Log the outcome</p>
                    <Field label="Outcome note">
                      <Input
                        value={outcomeNote}
                        onChange={(e) => setOutcomeNote(e.target.value)}
                        placeholder="No answer, spoke to customer, …"
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
                    <Button onClick={() => complete.mutate()} disabled={complete.isPending}>
                      {complete.isPending ? 'Saving…' : 'Mark completed'}
                    </Button>
                    <p className="text-[11px] text-faint">
                      Recorded as self-reported until the device log or provider verifies it.
                    </p>
                  </div>
                ) : null}
              </div>
            </Card>
          </div>

          <Card>
            <PanelHeader
              title="Latest activity"
              sub="Most recent contacts"
              right={
                data.timeline.length > 3 ? (
                  <button
                    type="button"
                    onClick={() => goTab('activity')}
                    className="shrink-0 text-[12.5px] font-medium text-brand-600 hover:underline"
                  >
                    View all
                  </button>
                ) : null
              }
            />
            {data.timeline.length === 0 ? (
              <PanelEmpty>No contacts yet. Start a call, SMS or WhatsApp.</PanelEmpty>
            ) : (
              <ul>{timelineRows(data.timeline.slice(0, 3))}</ul>
            )}
          </Card>
        </>
      ) : null}

      {tab === 'activity' ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_340px]">
          <Card>
            <PanelHeader title="Communication timeline" sub="Calls, SMS and WhatsApp on this case" />
            {data.timeline.length === 0 ? (
              <PanelEmpty>No contacts yet.</PanelEmpty>
            ) : (
              <ul>{timelineRows(data.timeline)}</ul>
            )}
          </Card>

          <Card>
            <PanelHeader
              title="Promises to pay"
              sub="Commitments from the customer"
              right={
                <Button variant="secondary" className="shrink-0" onClick={() => setPtpOpen(true)}>
                  <Plus className="h-3.5 w-3.5" /> Add
                </Button>
              }
            />
            {data.promises.length === 0 ? (
              <PanelEmpty>No promises yet.</PanelEmpty>
            ) : (
              <ul>
                {data.promises.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between gap-3 border-b border-line-soft px-5 py-3.5 last:border-b-0"
                  >
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium tabular-nums text-ink">
                        {money(p.promisedAmount)} <span className="font-normal text-muted">by {shortDate(p.dueDate)}</span>
                      </p>
                      <p className="truncate text-[11.5px] text-muted">
                        {[p.createdBy?.fullName, p.notes].filter(Boolean).join(' · ') || 'No notes'}
                      </p>
                    </div>
                    <StatusDot status={p.status} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      ) : null}

      {tab === 'customer' ? (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <PanelHeader title="Employment" sub="Shown on the collector app's Customer Information tab" />
              <form key={data.customerId} className="space-y-4 px-5 py-5" onSubmit={submitKyc}>
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
                  <Input name="monthlyIncome" type="number" min={0} defaultValue={data.monthlyIncome ?? ''} />
                </Field>
                <Button type="submit" variant="secondary" disabled={updateKyc.isPending}>
                  {updateKyc.isPending ? 'Saving…' : 'Save employment info'}
                </Button>
              </form>
            </Card>

            <Card>
              <PanelHeader title="Documents" sub="ID card and selfie" />
              <div className="grid grid-cols-2 gap-4 px-5 py-5">
                <PhotoSlot label="ID card" url={data.idCardPhotoUrl} onPick={pickKycPhoto('idCard')} />
                <PhotoSlot label="Selfie" url={data.selfiePhotoUrl} onPick={pickKycPhoto('selfie')} />
              </div>
            </Card>
          </div>

          <Card>
            <PanelHeader
              title="Guardians"
              sub="People who vouch for this customer. Call them if the customer is unreachable."
            />
            {(data.guardians ?? []).length === 0 ? (
              <PanelEmpty>No guardians on file.</PanelEmpty>
            ) : (
              <ul>
                {data.guardians!.map((g) => (
                  <li
                    key={g.id}
                    className="flex items-center gap-3 border-b border-line-soft px-5 py-3.5 last:border-b-0"
                  >
                    <img src={g.photoUrl} alt={g.fullName} className="h-10 w-10 shrink-0 rounded-lg object-cover" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium text-ink">
                        {g.fullName} <span className="font-normal text-muted">· {g.relationship}</span>
                      </p>
                      <p className="truncate text-[11.5px] text-muted">{g.address}</p>
                    </div>
                    <a href={`tel:${g.phone}`} className="shrink-0 text-[13px] font-medium text-brand-600 hover:underline">
                      {g.phone}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      ) : null}

      {tab === 'payments' ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_340px]">
          <Card>
            <PanelHeader title="Repayment history" sub="Confirmed payments on this loan" />
            {data.repayments.length === 0 ? (
              <PanelEmpty>No repayments yet.</PanelEmpty>
            ) : (
              <Table columns={['Reference', 'Date', 'Type', 'Timing', 'Amount']}>
                {data.repayments.map((r) => (
                  <Row key={r.id}>
                    <td className="py-3 font-mono text-xs text-ink">{r.orderReference}</td>
                    <td className="py-3 text-muted">{shortDate(r.receivedAt)}</td>
                    <td className="py-3">
                      <StatusDot
                        status={r.classification === 'FULL' ? 'CONFIRMED' : 'PENDING'}
                        label={r.classification === 'FULL' ? 'Full payment' : 'Partial'}
                      />
                    </td>
                    <td className="py-3 text-muted">
                      {r.daysEarly != null
                        ? `${Math.abs(r.daysEarly)} days ${r.daysEarly >= 0 ? 'early' : 'late'}`
                        : '—'}
                    </td>
                    <td className="py-3 text-right font-semibold tabular-nums text-ink">{money(r.amount)}</td>
                  </Row>
                ))}
              </Table>
            )}
          </Card>

          <Card>
            <PanelHeader title="Waiver & extension" sub="Admin-granted. Read-only on the collector app." />
            <form key={data.id} className="space-y-4 px-5 py-5" onSubmit={submitWaiver}>
              <label className="flex items-center gap-2.5 text-[13px] text-ink">
                <input
                  type="checkbox"
                  name="extensionApplied"
                  className="h-4 w-4 accent-brand-600"
                  defaultChecked={data.extensionApplied}
                />
                Extension applied
              </label>
              <label className="flex items-center gap-2.5 text-[13px] text-ink">
                <input
                  type="checkbox"
                  name="penaltyInterestReductionEnabled"
                  className="h-4 w-4 accent-brand-600"
                  defaultChecked={data.penaltyInterestReductionEnabled}
                />
                Reduce penalty interest
              </label>
              <Field label="Penalty interest amount">
                <Input name="penaltyInterestAmount" type="number" min={0} defaultValue={data.penaltyInterestAmount ?? 0} />
              </Field>
              <Field label="Waiver valid until">
                <Input
                  name="waiverValidUntil"
                  type="datetime-local"
                  defaultValue={data.waiverValidUntil ? data.waiverValidUntil.slice(0, 16) : ''}
                />
              </Field>
              <Button type="submit" variant="secondary" disabled={setWaiver.isPending}>
                {setWaiver.isPending ? 'Saving…' : 'Save waiver'}
              </Button>
              {data.originalOverdueAmount != null ? (
                <p className="text-[11px] text-faint">
                  Original overdue amount {money(data.originalOverdueAmount)}, restored if unpaid after the waiver expires.
                </p>
              ) : null}
            </form>
          </Card>
        </div>
      ) : null}

      <Modal
        open={ptpOpen}
        onClose={() => setPtpOpen(false)}
        title="Add promise to pay"
        subtitle="Record what the customer committed to"
        size="sm"
        dirty={ptpDirty}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setPtpOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="ptp-form" disabled={createPtp.isPending}>
              {createPtp.isPending ? 'Saving…' : 'Save promise'}
            </Button>
          </>
        }
      >
        <form
          id="ptp-form"
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            createPtp.mutate();
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount" required>
              <Input type="number" value={ptpAmount} onChange={(e) => setPtpAmount(e.target.value)} required min={0} />
            </Field>
            <Field label="Promised date" required>
              <Input type="date" value={ptpDate} onChange={(e) => setPtpDate(e.target.value)} required />
            </Field>
          </div>
          <Field label="Notes">
            <Input value={ptpNotes} onChange={(e) => setPtpNotes(e.target.value)} placeholder="Optional" />
          </Field>
        </form>
      </Modal>

      <DeviceLockDialog
        device={lockAction && data.deviceId ? lockTarget(data) : null}
        action={lockAction ?? 'LOCK'}
        onClose={() => setLockAction(null)}
      />
    </div>
  );
}

const CHANNEL_LABEL: Record<string, string> = { CALL: 'Call', SMS: 'SMS', WHATSAPP: 'WhatsApp' };

type CaseTab = 'overview' | 'activity' | 'customer' | 'payments';
const CASE_TABS: { id: CaseTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'activity', label: 'Activity' },
  { id: 'customer', label: 'Customer' },
  { id: 'payments', label: 'Payments' },
];

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 text-[13px] text-ink">{children}</dd>
    </div>
  );
}

function PhotoSlot({
  label,
  url,
  onPick,
}: {
  label: string;
  url: string | null;
  onPick: (e: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs text-muted">{label}</p>
      {url ? (
        <img src={url} alt={label} className="mb-2 h-28 w-full rounded-lg object-cover" />
      ) : (
        <div className="mb-2 flex h-28 w-full items-center justify-center rounded-lg border border-dashed border-line bg-elevated text-xs text-faint">
          Not uploaded
        </div>
      )}
      <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-elevated px-3 py-1.5 text-[13px] font-medium text-ink-soft transition hover:bg-hover hover:text-ink">
        <Upload className="h-3.5 w-3.5" /> {url ? 'Replace' : 'Upload'}
        <input type="file" accept="image/*" className="sr-only" onChange={onPick} />
      </label>
    </div>
  );
}

function lockTarget(d: CaseDetail) {
  return {
    id: d.deviceId ?? '',
    imei: d.deviceImei ?? '',
    model: d.deviceModel,
    customerName: d.customerName,
    company: d.companyName,
    status: d.deviceStatus ?? '',
  };
}
