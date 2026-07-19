import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PhoneCall, CalendarClock, ShieldCheck } from 'lucide-react';
import { api } from '../api/client';
import type { CallAttempt, CallFollowUp, CallPerformanceRow, CallQueueItem, StaffUser } from '../api/types';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Pill, StatusPill } from '../components/ui/Pill';
import { Center, EmptyState, Spinner } from '../components/ui/misc';
import { shortDate } from '../lib/format';

const outcomes = ['NO_ANSWER', 'PROMISE_TO_PAY', 'DISPUTE', 'PAID_ALREADY', 'WRONG_NUMBER', 'ESCALATED', 'GENERAL_NOTE'];
const escalations = ['NONE', 'WATCH', 'MANAGER_REVIEW', 'FIELD_VISIT', 'REPOSSESSION_REVIEW'];
const inputClass = 'w-full rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:border-brand-300 focus:ring-2 focus:ring-brand-100';

export default function CallCentre() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<CallQueueItem | null>(null);
  const [outcome, setOutcome] = useState('PROMISE_TO_PAY');
  const [notes, setNotes] = useState('');
  const [promiseToPayAt, setPromiseToPayAt] = useState('');
  const [nextFollowUpAt, setNextFollowUpAt] = useState('');
  const [escalationStatus, setEscalationStatus] = useState('NONE');
  const [staffPhone, setStaffPhone] = useState('');
  const [activeAttempt, setActiveAttempt] = useState<CallAttempt | null>(null);
  const [assignedToId, setAssignedToId] = useState('');
  const [assignmentDate, setAssignmentDate] = useState('');
  const [assignmentNotes, setAssignmentNotes] = useState('');

  const queue = useQuery({
    queryKey: ['call-centre', 'queue'],
    queryFn: async () => (await api.get<CallQueueItem[]>('/call-centre/queue')).data,
  });
  const followUps = useQuery({
    queryKey: ['call-centre', 'follow-ups'],
    queryFn: async () => (await api.get<CallFollowUp[]>('/call-centre/follow-ups')).data,
  });
  const performance = useQuery({
    queryKey: ['call-centre', 'performance'],
    queryFn: async () => (await api.get<CallPerformanceRow[]>('/call-centre/performance')).data,
  });
  const attempts = useQuery({
    queryKey: ['call-centre', 'attempts'],
    queryFn: async () => (await api.get<CallAttempt[]>('/call-centre/attempts')).data,
  });
  const staff = useQuery({
    queryKey: ['users', 'call-centre-staff'],
    queryFn: async () => (await api.get<StaffUser[]>('/users')).data.filter((u) => u.isActive),
  });

  const assign = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error('Select a customer first');
      if (!assignedToId) throw new Error('Select a staff member');
      return api.post('/call-centre/assignments', {
        loanId: selected.loanId,
        assignedToId,
        nextFollowUpAt: assignmentDate ? new Date(assignmentDate).toISOString() : undefined,
        notes: assignmentNotes || undefined,
      });
    },
    onSuccess: () => {
      setAssignmentNotes('');
      setAssignmentDate('');
      qc.invalidateQueries({ queryKey: ['call-centre'] });
    },
  });

  const startCall = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error('Select a customer first');
      return (await api.post<CallAttempt>('/call-centre/calls/start', {
        loanId: selected.loanId,
        staffPhone: staffPhone || undefined,
      })).data;
    },
    onSuccess: (attempt) => {
      setActiveAttempt(attempt);
      qc.invalidateQueries({ queryKey: ['call-centre'] });
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error('Select a customer first');
      const url = activeAttempt ? '/call-centre/calls/complete' : '/call-centre/follow-ups';
      return api.post(url, {
        loanId: selected.loanId,
        attemptId: activeAttempt?.id,
        outcome,
        notes: notes || undefined,
        promiseToPayAt: promiseToPayAt ? new Date(promiseToPayAt).toISOString() : undefined,
        nextFollowUpAt: nextFollowUpAt ? new Date(nextFollowUpAt).toISOString() : undefined,
        escalationStatus,
      });
    },
    onSuccess: () => {
      setNotes('');
      setPromiseToPayAt('');
      setNextFollowUpAt('');
      setActiveAttempt(null);
      qc.invalidateQueries({ queryKey: ['call-centre'] });
    },
  });

  if (queue.isLoading) return <Center><Spinner /></Center>;

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.4fr_0.9fr]">
      <Card>
        <CardHeader title="Overdue call queue" subtitle="Customers needing human follow-up today" />
        <div className="space-y-3 p-5">
          {!queue.data?.length ? <EmptyState title="No overdue customers" /> : queue.data.map((item) => (
            <button
              key={item.loanId}
              onClick={() => setSelected(item)}
              className={`w-full rounded-xl border p-4 text-left transition ${selected?.loanId === item.loanId ? 'border-brand-300 bg-brand-50' : 'border-line bg-white hover:bg-canvas'}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-semibold">{item.customerName}</p>
                  <p className="text-sm text-muted">{item.customerPhone} · {item.deviceModel ?? item.deviceImei}</p>
                </div>
                <StatusPill status={item.deviceStatus} />
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <Pill tone="red">{item.daysOverdue} day(s) overdue</Pill>
                <Pill tone="amber">{item.currency} {item.amountDue.toLocaleString()}</Pill>
                {item.lastFollowUp ? <Pill tone="blue">Last: {item.lastFollowUp.outcome.replace(/_/g, ' ')}</Pill> : null}
                {item.lastFollowUp?.assignedTo ? <Pill tone="brand">Assigned: {item.lastFollowUp.assignedTo.fullName}</Pill> : null}
                {item.lastFollowUp?.attempts?.[0] ? <Pill tone="green">{item.lastFollowUp.attempts[0].verificationStatus.replace(/_/g, ' ')}</Pill> : null}
              </div>
            </button>
          ))}
        </div>
      </Card>

      <div className="space-y-6">
        <Card>
          <CardHeader title="Assign follow-up" subtitle={selected ? selected.customerName : 'Select a queue item'} />
          <div className="space-y-4 p-5">
            <Field label="Staff member">
              <select value={assignedToId} onChange={(e) => setAssignedToId(e.target.value)} className={inputClass}>
                <option value="">Select staff</option>
                {staff.data?.map((u) => <option key={u.id} value={u.id}>{u.fullName} ({u.role})</option>)}
              </select>
            </Field>
            <Field label="Due date for follow-up">
              <input type="date" value={assignmentDate} onChange={(e) => setAssignmentDate(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Assignment notes">
              <textarea value={assignmentNotes} onChange={(e) => setAssignmentNotes(e.target.value)} className={`${inputClass} min-h-20`} placeholder="What should staff ask or confirm?" />
            </Field>
            <Button onClick={() => assign.mutate()} disabled={!selected || !assignedToId || assign.isPending} className="w-full">
              Assign customer follow-up
            </Button>
          </div>
        </Card>

        <Card>
          <CardHeader title="System call" subtitle={selected ? selected.customerName : 'Select a queue item'} />
          <div className="space-y-4 p-5">
            <Field label="Staff phone for provider bridge call">
              <input value={staffPhone} onChange={(e) => setStaffPhone(e.target.value)} className={inputClass} placeholder="e.g. 2557XXXXXXXX" />
            </Field>
            <Button onClick={() => startCall.mutate()} disabled={!selected || startCall.isPending} className="w-full">
              <PhoneCall className="h-4 w-4" /> Start verified call
            </Button>
            {activeAttempt ? (
              <div className="rounded-xl border border-brand-200 bg-brand-50 p-3 text-sm text-brand-800">
                <div className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4" /> Attempt created</div>
                <p className="mt-1">Status: {activeAttempt.verificationStatus.replace(/_/g, ' ')} · Provider: {activeAttempt.providerStatus ?? 'pending'}</p>
              </div>
            ) : (
              <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
                Calls saved without pressing Start verified call are marked SELF REPORTED.
              </p>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Complete call note" subtitle={activeAttempt ? 'Linked to tracked attempt' : 'Manual/self-reported fallback'} />
          <div className="space-y-4 p-5">
            <Field label="Outcome">
              <select value={outcome} onChange={(e) => setOutcome(e.target.value)} className={inputClass}>
                {outcomes.map((o) => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
              </select>
            </Field>
            <Field label="Escalation">
              <select value={escalationStatus} onChange={(e) => setEscalationStatus(e.target.value)} className={inputClass}>
                {escalations.map((e) => <option key={e} value={e}>{e.replace(/_/g, ' ')}</option>)}
              </select>
            </Field>
            <Field label="Promise-to-pay date">
              <input type="date" value={promiseToPayAt} onChange={(e) => setPromiseToPayAt(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Next follow-up">
              <input type="date" value={nextFollowUpAt} onChange={(e) => setNextFollowUpAt(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Notes">
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className={`${inputClass} min-h-24`} placeholder="What did the customer say?" />
            </Field>
            <Button onClick={() => save.mutate()} disabled={!selected || save.isPending} className="w-full">
              <PhoneCall className="h-4 w-4" /> Save call note
            </Button>
          </div>
        </Card>

        <Card>
          <CardHeader title="Performance" subtitle="Call outcomes recorded" />
          <div className="space-y-2 p-5">
            {!performance.data?.length ? <EmptyState title="No calls yet" /> : performance.data.map((row) => (
              <div key={`${row.staffId}-${row.outcome}`} className="flex items-center justify-between rounded-xl bg-canvas px-4 py-2 text-sm">
                <span>{row.outcome.replace(/_/g, ' ')}</span>
                <span className="font-semibold">{row.count}{row.avgDurationSeconds ? ` · ${row.avgDurationSeconds}s avg` : ''}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="xl:col-span-2">
        <CardHeader title="Verified call attempts" />
        <div className="divide-y divide-line p-5">
          {!attempts.data?.length ? <EmptyState title="No system calls started" /> : attempts.data.slice(0, 10).map((a) => (
            <div key={a.id} className="flex items-start justify-between gap-4 py-3 text-sm">
              <div>
                <p className="font-medium">{a.customer?.fullName ?? a.customerPhone} · {a.verificationStatus.replace(/_/g, ' ')}</p>
                <p className="text-muted">Provider: {a.provider ?? 'none'} · Status: {a.providerStatus ?? 'pending'} · Duration: {a.durationSeconds ?? 0}s</p>
                {a.recordingUrl ? <a className="text-brand-700 underline" href={a.recordingUrl} target="_blank" rel="noreferrer">Recording</a> : null}
              </div>
              <p className="text-xs text-muted">{shortDate(a.startedAt)}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card className="xl:col-span-2">
        <CardHeader title="Recent follow-ups" />
        <div className="divide-y divide-line p-5">
          {!followUps.data?.length ? <EmptyState title="No follow-ups recorded" /> : followUps.data.slice(0, 12).map((f) => (
            <div key={f.id} className="flex items-start justify-between gap-4 py-3 text-sm">
              <div>
                <p className="font-medium">{f.customer?.fullName ?? 'Customer'} · {f.outcome.replace(/_/g, ' ')}</p>
                <p className="text-muted">{f.notes || 'No notes'}</p>
                {f.attempts?.[0] ? <p className="text-xs text-muted">Evidence: {f.attempts[0].verificationStatus.replace(/_/g, ' ')} · {f.attempts[0].durationSeconds ?? 0}s</p> : <p className="text-xs text-amber-700">Evidence: SELF REPORTED</p>}
                {f.promiseToPayAt ? <p className="mt-1 inline-flex items-center gap-1 text-xs text-brand-700"><CalendarClock className="h-3 w-3" /> Promise: {shortDate(f.promiseToPayAt)}</p> : null}
              </div>
              <div className="text-right">
                <StatusPill status={f.escalationStatus} />
                <p className="mt-1 text-xs text-muted">{shortDate(f.calledAt)}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-sm"><span className="mb-1 block text-xs font-medium text-muted">{label}</span>{children}</label>;
}
