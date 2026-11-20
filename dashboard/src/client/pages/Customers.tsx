import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Check, Plus, ShieldCheck } from '@/shared/icons';
import { api } from '@/shared/api/client';
import { apiErrorMessage } from '@/shared/agreements/apiError';
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
import {
  GuardiansFooter,
  GuardiansStep,
  idTypeLabel,
  VerificationDot,
  type GuardianStatus,
} from '../components/customer';
import { useConfirm } from '@/shared/components/ui/ConfirmDialog';

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
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('ALL');
  const [onboarding, setOnboarding] = useState(false);

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
              <Row key={c.id} onClick={() => navigate(`/customers/${c.id}`)}>
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
                  {c._count?.guardians ?? 0}
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
  const [gStatus, setGStatus] = useState<GuardianStatus>({ done: false, full: false, pending: false });

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
    ) : (
      <GuardiansFooter status={gStatus} onClose={onClose} closeLabel="Finish later" />
    );

  return (
    <Modal
      open
      onClose={onClose}
      title="Register customer"
      subtitle={`Step ${step + 1} of 3 · ${['Details', 'ID and face check', 'Guardian'][step]}`}
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
