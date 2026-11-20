import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Check } from '@/shared/icons';
import { api } from '@/shared/api/client';
import { apiErrorMessage } from '@/shared/agreements/apiError';
import type { Customer, Guardian, VerificationStatus } from '@/shared/api/types';
import { FormSection } from '@/shared/components/ui/FormSection';
import { Button } from '@/shared/components/ui/Button';
import { StatusDot } from '@/shared/components/ui/Pill';
import { emptyPerson, ID_TYPES, PersonFields, validatePerson, type PersonForm } from './PersonFields';

/** One guardian is needed before a sale; up to three can be added. */
export const REQUIRED_GUARDIANS = 1;
export const MAX_GUARDIANS = 3;

export function idTypeLabel(type?: string | null) {
  return ID_TYPES.find((t) => t.value === type)?.label ?? 'ID';
}

export const STATUS_VIEW: Record<VerificationStatus, { dot: string; label: string }> = {
  VERIFIED: { dot: 'ACTIVE', label: 'Verified' },
  NEEDS_REVIEW: { dot: 'PENDING', label: 'Needs review' },
  FAILED: { dot: 'FAILED', label: 'Failed' },
  UNVERIFIED: { dot: 'NONE', label: 'Not verified' },
};

export function VerificationDot({ status }: { status?: VerificationStatus }) {
  const v = STATUS_VIEW[status ?? 'UNVERIFIED'];
  return <StatusDot status={v.dot} label={v.label} />;
}


/** Records guardians one by one: one is required, up to three can be added. Each is saved on its own. */
export const GUARDIAN_FORM_ID = 'guardian-form';

/** `done`: the required minimum is saved. `full`: no more can be added. */
export type GuardianStatus = { done: boolean; full: boolean; pending: boolean };

/** Footer buttons for any modal that hosts GuardiansStep, so they are identical everywhere. */
export function GuardiansFooter({
  status,
  onClose,
  closeLabel = 'Close',
}: {
  status: GuardianStatus;
  onClose: () => void;
  closeLabel?: string;
}) {
  if (!status.done) {
    return (
      <>
        <Button variant="secondary" type="button" onClick={onClose}>
          {closeLabel}
        </Button>
        <Button type="submit" form={GUARDIAN_FORM_ID} disabled={status.pending}>
          {status.pending ? 'Saving…' : 'Save and continue'}
        </Button>
      </>
    );
  }
  return (
    <>
      {status.full ? null : (
        <Button variant="secondary" type="submit" form={GUARDIAN_FORM_ID} disabled={status.pending}>
          {status.pending ? 'Saving…' : 'Add another guardian'}
        </Button>
      )}
      <Button type="button" onClick={onClose}>
        Done
      </Button>
    </>
  );
}

/** The form has no buttons of its own: the modal footer submits it via GUARDIAN_FORM_ID. */
export function GuardiansStep({
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
  const full = have >= MAX_GUARDIANS;
  useEffect(() => {
    onStatus({ done, full, pending: add.isPending });
  }, [done, full, add.isPending]); // eslint-disable-line react-hooks/exhaustive-deps

  if (full) {
    return (
      <p className="flex items-center gap-2 text-sm text-ink">
        <Check className="h-4 w-4 text-emerald-600" /> {MAX_GUARDIANS} guardians are saved. That is the maximum.
      </p>
    );
  }

  return (
    <FormSection
      title={done ? `Another guardian (optional)` : 'Guardian (required)'}
      description={
        done
          ? `${have} saved. You can add up to ${MAX_GUARDIANS - have} more, or press Done.`
          : 'One person who vouches for the customer. They need a phone, ID and address.'
      }
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

