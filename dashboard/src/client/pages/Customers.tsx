import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Check, Plus, ShieldCheck } from '@/shared/icons';
import { api } from '@/shared/api/client';
import { apiErrorMessage } from '@/shared/agreements/apiError';
import { useAuth } from '@/shared/auth/AuthContext';
import type { Customer, Guardian, VerificationStatus } from '@/shared/api/types';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Field, Input } from '@/shared/components/ui/Field';
import { FormSection } from '@/shared/components/ui/FormSection';
import { Modal } from '@/shared/components/ui/Modal';
import { StatusDot } from '@/shared/components/ui/Pill';
import { Table, Row } from '@/shared/components/ui/Table';
import { Avatar, Center, EmptyState, Spinner } from '@/shared/components/ui/misc';
import { FigureStrip } from '@/shared/components/FigureStrip';
import { ListToolbar } from '@/shared/components/ListToolbar';
import { PanelEmpty } from '@/shared/components/Panel';
import { shortDate } from '@/shared/lib/format';
import {
  emptyPerson,
  ID_TYPES,
  PersonFields,
  validatePerson,
  type PersonErrors,
  type PersonForm,
} from '../components/PersonFields';
import { PhoneVerification } from '../components/PhoneVerification';
import { useConfirm } from '@/shared/components/ui/ConfirmDialog';

const REQUIRED_GUARDIANS = 3;

function idTypeLabel(type?: string | null) {
  return ID_TYPES.find((t) => t.value === type)?.label ?? 'ID';
}

const STATUS_VIEW: Record<VerificationStatus, { dot: string; label: string }> = {
  VERIFIED: { dot: 'ACTIVE', label: 'Verified' },
  NEEDS_REVIEW: { dot: 'PENDING', label: 'Needs review' },
  FAILED: { dot: 'FAILED', label: 'Failed' },
  UNVERIFIED: { dot: 'NONE', label: 'Not verified' },
};

function VerificationDot({ status }: { status?: VerificationStatus }) {
  const v = STATUS_VIEW[status ?? 'UNVERIFIED'];
  return <StatusDot status={v.dot} label={v.label} />;
}

const FILTERS = [
  { value: 'ALL', label: 'All customers' },
  { value: 'VERIFIED', label: 'Verified' },
  { value: 'NEEDS_REVIEW', label: 'Needs review' },
  { value: 'UNVERIFIED', label: 'Not verified' },
  { value: 'FAILED', label: 'Failed' },
];

/**
 * Customer onboarding: register the person, check their ID and face, and record
 * their guardians. Selling a phone happens on the Sales page and only offers
 * customers who are verified here.
 */
export default function Customers() {
  const { user } = useAuth();
  const canReview = user?.role === 'OWNER' || user?.role === 'MANAGER';
  const qc = useQueryClient();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('ALL');
  const [onboarding, setOnboarding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => (await api.get<Customer[]>('/customers')).data,
  });

  const stats = useMemo(() => {
    const all = data ?? [];
    const n = (s: VerificationStatus) => all.filter((c) => (c.verificationStatus ?? 'UNVERIFIED') === s).length;
    return {
      total: all.length,
      verified: n('VERIFIED'),
      review: n('NEEDS_REVIEW'),
      pending: n('UNVERIFIED') + n('FAILED'),
    };
  }, [data]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data ?? []).filter(
      (c) =>
        (filter === 'ALL' || (c.verificationStatus ?? 'UNVERIFIED') === filter) &&
        (!q ||
          [c.fullName, c.phone, c.nationalId]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(q))),
    );
  }, [data, query, filter]);

  if (isLoading) {
    return (
      <Center>
        <Spinner />
      </Center>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <Button onClick={() => setOnboarding(true)}>
          <Plus className="h-4 w-4" /> Register customer
        </Button>
      </div>

      <FigureStrip
        items={[
          { label: 'Customers', value: stats.total },
          { label: 'Verified', value: stats.verified, hint: 'Ready to buy on credit' },
          { label: 'Needs review', value: stats.review },
          { label: 'Not verified', value: stats.pending },
        ]}
      />

      <Card>
        <ListToolbar
          title="Customers"
          noun="customer"
          count={rows.length}
          query={query}
          onQuery={setQuery}
          placeholder="Search name, phone, ID number"
          filter={{ value: filter, onChange: setFilter, options: FILTERS }}
        />
        {!data || data.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title="No customers yet"
              hint="Register a customer, verify their ID and face, and add their guardians. Then you can sell them a phone."
            />
          </div>
        ) : rows.length === 0 ? (
          <PanelEmpty>No customers match.</PanelEmpty>
        ) : (
          <Table columns={['Customer', 'Phone', 'Person ID', 'Verification', 'Guardians', 'Joined']}>
            {rows.map((c) => (
              <Row key={c.id} onClick={() => setOpenId(c.id)}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={c.fullName} />
                    <span className="font-medium">{c.fullName}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-muted">{c.phone}</td>
                <td className="px-4 py-3 text-muted">
                  {c.nationalId ? `${idTypeLabel(c.idDocumentType)} · ${c.nationalId}` : '—'}
                </td>
                <td className="px-4 py-3">
                  <VerificationDot status={c.verificationStatus} />
                </td>
                <td className="px-4 py-3 text-muted">
                  {c._count?.guardians ?? 0} of {REQUIRED_GUARDIANS}
                </td>
                <td className="px-4 py-3 text-right text-muted">{shortDate(c.createdAt)}</td>
              </Row>
            ))}
          </Table>
        )}
      </Card>

      {onboarding ? (
        <Onboarding
          onClose={() => setOnboarding(false)}
          onSaved={() => qc.invalidateQueries({ queryKey: ['customers'] })}
        />
      ) : null}

      {openId ? (
        <CustomerDetail
          id={openId}
          canReview={canReview}
          onClose={() => setOpenId(null)}
          onChanged={() => qc.invalidateQueries({ queryKey: ['customers'] })}
        />
      ) : null}
    </div>
  );
}

function normalizePhone(p: string) {
  return p.replace(/\D/g, '').replace(/^255/, '').replace(/^0/, '');
}

/** Three steps: details, identity check, guardians. Each is saved as it is completed. */
function Onboarding({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [step, setStep] = useState(0);
  const [person, setPerson] = useState<PersonForm>(emptyPerson());
  const [showErrors, setShowErrors] = useState(false);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [error, setError] = useState('');
  const [gStatus, setGStatus] = useState<GuardianStatus>({ done: false, pending: false });

  const errors: PersonErrors = showErrors ? validatePerson(person, 'customer', { photoOptional: true }) : {};

  const save = useMutation({
    mutationFn: async () => {
      const base = {
        fullName: person.fullName.trim(),
        nationalId: person.nationalId.trim(),
        idDocumentType: person.idDocumentType,
        address: person.address.trim(),
      };
      if (customer) return (await api.patch<Customer>(`/customers/${customer.id}`, base)).data;
      const phone = person.phone.trim();
      const all = (await api.get<Customer[]>('/customers')).data;
      if (all.some((c) => normalizePhone(c.phone) === normalizePhone(phone))) {
        throw new Error('A customer with this phone number is already registered');
      }
      return (await api.post<Customer>('/customers', { ...base, phone })).data;
    },
    onSuccess: (c) => {
      setCustomer(c);
      setError('');
      setStep(1);
      onSaved();
    },
    onError: (e) => setError(e instanceof Error && !('response' in e) ? e.message : apiErrorMessage(e)),
  });

  const dirty = !!(person.fullName || person.phone || person.nationalId || customer);

  const footer =
    step === 0 ? (
      <>
        <Button variant="secondary" type="button" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          disabled={save.isPending}
          onClick={() => {
            if (Object.keys(validatePerson(person, 'customer', { photoOptional: true })).length) {
              setShowErrors(true);
              return;
            }
            save.mutate();
          }}
        >
          {save.isPending ? 'Saving…' : 'Save and verify'}
        </Button>
      </>
    ) : step === 1 ? (
      <>
        <Button variant="secondary" type="button" onClick={onClose}>
          Verify later
        </Button>
        <Button type="button" onClick={() => setStep(2)} disabled={!customer?.verificationChecks}>
          Next: guardians
        </Button>
      </>
    ) : gStatus.done ? (
      <Button type="button" onClick={onClose}>
        Done
      </Button>
    ) : (
      <>
        <Button variant="secondary" type="button" onClick={onClose}>
          Finish later
        </Button>
        <Button type="submit" form={GUARDIAN_FORM_ID} disabled={gStatus.pending}>
          {gStatus.pending ? 'Saving…' : 'Save and continue'}
        </Button>
      </>
    );

  return (
    <Modal
      open
      onClose={onClose}
      title="Register customer"
      subtitle={`Step ${step + 1} of 3 · ${['Details', 'ID and face check', 'Guardians'][step]}`}
      size="md"
      dirty={dirty && step < 2}
      footer={footer}
    >
      {error ? (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-rose-400/40 bg-rose-500/5 px-3 py-2.5 text-sm text-rose-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </div>
      ) : null}

      {step === 0 ? (
        <FormSection title="Customer details" description="Exactly as written on the ID.">
          <PersonFields kind="customer" value={person} onChange={setPerson} errors={errors} hidePhoto />
        </FormSection>
      ) : null}

      {step === 1 && customer ? (
        <FormSection
          title="Check ID and face"
          description="Done on your phone: the ID front and back are photographed, then a live check. The number is also checked for format and duplicates."
        >
          <PhoneVerification customer={customer} onComplete={(c) => { setCustomer(c); onSaved(); }} />
        </FormSection>
      ) : null}

      {step === 2 && customer ? (
        <GuardiansStep customer={customer} onSaved={onSaved} onStatus={setGStatus} />
      ) : null}
    </Modal>
  );
}

/** Records the three guardians one by one. Each is saved on its own. */
export const GUARDIAN_FORM_ID = 'guardian-form';

type GuardianStatus = { done: boolean; pending: boolean };

/** The form has no buttons of its own: the modal footer submits it via GUARDIAN_FORM_ID. */
function GuardiansStep({
  customer,
  onSaved,
  onStatus,
}: {
  customer: Customer;
  onSaved: () => void;
  onStatus: (s: GuardianStatus) => void;
}) {
  const { data, refetch } = useQuery({
    queryKey: ['customer', customer.id],
    queryFn: async () => (await api.get<Customer>(`/customers/${customer.id}`)).data,
  });
  const have = data?.guardians?.length ?? 0;
  const [g, setG] = useState<PersonForm>(emptyPerson());
  const [showErrors, setShowErrors] = useState(false);
  const [error, setError] = useState('');

  const add = useMutation({
    mutationFn: async () => {
      const body = new FormData();
      body.append('fullName', g.fullName.trim());
      body.append('relationship', g.relationship);
      body.append('phone', g.phone.trim());
      body.append('idDocumentType', g.idDocumentType);
      body.append('nationalId', g.nationalId.trim());
      body.append('address', g.address.trim());
      return (await api.post<Guardian>(`/customers/${customer.id}/guardians`, body)).data;
    },
    onSuccess: async () => {
      setG(emptyPerson());
      setShowErrors(false);
      setError('');
      await refetch();
      onSaved();
    },
    onError: (e) => setError(apiErrorMessage(e)),
  });

  const errors = showErrors ? validatePerson(g, 'guardian', { photoOptional: true }) : {};
  const phoneClash = g.phone.replace(/\D/g, '') === customer.phone.replace(/\D/g, '');

  const done = have >= REQUIRED_GUARDIANS;
  useEffect(() => {
    onStatus({ done, pending: add.isPending });
  }, [done, add.isPending]); // eslint-disable-line react-hooks/exhaustive-deps

  if (done) {
    return (
      <p className="flex items-center gap-2 text-sm text-ink">
        <Check className="h-4 w-4 text-emerald-600" /> All {REQUIRED_GUARDIANS} guardians are saved.
      </p>
    );
  }

  return (
    <FormSection
      title={`Guardian ${have + 1} of ${REQUIRED_GUARDIANS}`}
      description="Someone who vouches for the customer. Each needs a phone, ID and address."
    >
      <form
        id={GUARDIAN_FORM_ID}
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (Object.keys(validatePerson(g, 'guardian', { photoOptional: true })).length || phoneClash) {
            setShowErrors(true);
            return;
          }
          add.mutate();
        }}
      >
        {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        <PersonFields
          key={have}
          kind="guardian"
          value={g}
          onChange={setG}
          errors={{ ...errors, ...(showErrors && phoneClash ? { phone: 'Must differ from the customer' } : {}) }}
          hidePhoto
        />
      </form>
    </FormSection>
  );
}

/** A registered customer: photos, check results, and the actions to finish onboarding. */
function CustomerDetail({
  id,
  canReview,
  onClose,
  onChanged,
}: {
  id: string;
  canReview: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { confirm, dialog } = useConfirm();
  const qc = useQueryClient();
  const [mode, setMode] = useState<'view' | 'verify' | 'guardians'>('view');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [gStatus, setGStatus] = useState<GuardianStatus>({ done: false, pending: false });

  const { data: c, isLoading } = useQuery({
    queryKey: ['customer', id],
    queryFn: async () => (await api.get<Customer>(`/customers/${id}`)).data,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['customer', id] });
    onChanged();
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

  const checks = c?.verificationChecks;
  const status = c?.verificationStatus ?? 'UNVERIFIED';
  const guardianCount = c?.guardians?.length ?? 0;

  return (
    <>
      {dialog}
    <Modal
      open
      onClose={onClose}
      title={c?.fullName ?? 'Customer'}
      subtitle={c?.phone}
      size="md"
      footer={
        mode === 'verify' ? (
          <Button variant="secondary" onClick={() => setMode('view')}>
            Back
          </Button>
        ) : mode === 'guardians' ? (
          <>
            <Button variant="secondary" onClick={() => setMode('view')}>
              Back
            </Button>
            {!gStatus.done ? (
              <Button type="submit" form={GUARDIAN_FORM_ID} disabled={gStatus.pending}>
                {gStatus.pending ? 'Saving…' : 'Save and continue'}
              </Button>
            ) : null}
          </>
        ) : undefined
      }
    >
      {isLoading || !c ? (
        <Center>
          <Spinner />
        </Center>
      ) : mode === 'verify' ? (
        <FormSection title="Check ID and face">
          <PhoneVerification customer={c} onComplete={refresh} />
        </FormSection>
      ) : mode === 'guardians' ? (
        <GuardiansStep customer={c} onSaved={refresh} onStatus={setGStatus} />
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <VerificationDot status={status} />
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setMode('verify')}>
                <ShieldCheck className="h-4 w-4" /> {status === 'UNVERIFIED' ? 'Verify identity' : 'Verify again'}
              </Button>
              {guardianCount < REQUIRED_GUARDIANS ? (
                <Button variant="secondary" onClick={() => setMode('guardians')}>
                  Add guardians
                </Button>
              ) : null}
            </div>
          </div>

          <FormSection title="Details">
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <Info label="ID" value={c.nationalId ? `${idTypeLabel(c.idDocumentType)} · ${c.nationalId}` : '—'} />
              <Info label="Address" value={c.address ?? '—'} />
              <Info label="Guardians" value={`${guardianCount} of ${REQUIRED_GUARDIANS}`} />
              <Info label="Registered" value={shortDate(c.createdAt)} />
            </dl>
          </FormSection>

          {c.selfiePhotoUrl || c.idCardPhotoUrl ? (
            <FormSection title="Photos">
              <div className="flex flex-wrap gap-4">
                {c.selfiePhotoUrl ? <Photo src={c.selfiePhotoUrl} label="Live selfie" /> : null}
                {c.idCardPhotoUrl ? <Photo src={c.idCardPhotoUrl} label="ID card" /> : null}
              </div>
            </FormSection>
          ) : null}

          {checks ? (
            <FormSection title="Checks">
              <ul className="space-y-1.5 text-sm">
                <Check1 ok={checks.idFormat.passed} label="ID number is valid" note={checks.idFormat.reason} />
                <Check1
                  ok={checks.duplicateId.passed}
                  label="ID is not used by another customer"
                  note={checks.duplicateId.matches ? `Already registered to ${checks.duplicateId.matches}` : null}
                />
                <Check1 ok={checks.photos.passed} label="ID and selfie photos on file" />
                <Check1
                  ok={checks.liveness.passed}
                  label="Live person (blinked on camera)"
                  note={
                    checks.liveness.info
                      ? `Detector: ${checks.liveness.info.fps} frames/s, face seen in ${checks.liveness.info.faceFrames} of ${checks.liveness.info.frames} frames, ${checks.liveness.info.attempts} attempt(s)`
                      : null
                  }
                />
                <Check1
                  ok={checks.face.passed}
                  label="Face matches the ID photo"
                  note={`Distance ${checks.face.distance.toFixed(2)} (match below ${checks.face.matchBelow})`}
                />
              </ul>
              {c.verificationNotes ? (
                <p className="text-xs text-muted">Manager note: {c.verificationNotes}</p>
              ) : null}
            </FormSection>
          ) : null}

          {canReview && status !== 'VERIFIED' && status !== 'UNVERIFIED' ? (
            <FormSection
              title="Manager decision"
              description="Use when the automatic checks could not settle it, for example after meeting the customer."
            >
              {error ? <p className="text-sm text-rose-600">{error}</p> : null}
              <Field label="Note">
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Why you approved or rejected" />
              </Field>
              <div className="flex gap-2">
                <Button disabled={review.isPending || !notes.trim()} onClick={async () => {
                    if (
                      await confirm({
                        title: `Approve ${c.fullName}?`,
                        message: 'They will be marked verified and can buy on credit. Your note is saved with the decision.',
                        confirmLabel: 'Approve',
                      })
                    )
                      review.mutate('VERIFIED');
                  }}>
                  Approve
                </Button>
                <Button variant="secondary" disabled={review.isPending || !notes.trim()} onClick={async () => {
                    if (
                      await confirm({
                        title: `Reject ${c.fullName}?`,
                        message: 'They will be marked as failed and cannot buy on credit until they are verified again.',
                        confirmLabel: 'Reject',
                        danger: true,
                      })
                    )
                      review.mutate('FAILED');
                  }}>
                  Reject
                </Button>
              </div>
            </FormSection>
          ) : null}
        </div>
      )}
    </Modal>
    </>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-faint">{label}</dt>
      <dd className="text-ink">{value}</dd>
    </div>
  );
}

function Photo({ src, label }: { src: string; label: string }) {
  return (
    <figure>
      <img src={src} alt={label} className="h-28 w-28 rounded-xl object-cover" />
      <figcaption className="mt-1 text-xs text-muted">{label}</figcaption>
    </figure>
  );
}

function Check1({ ok, label, note }: { ok: boolean; label: string; note?: string | null }) {
  return (
    <li className="flex items-start gap-2">
      {ok ? (
        <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
      ) : (
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
      )}
      <span className="text-ink">
        {label}
        {note ? <span className="block text-xs text-muted">{note}</span> : null}
      </span>
    </li>
  );
}
