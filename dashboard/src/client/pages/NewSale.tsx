import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  CreditCard,
  Plus,
  QrCode,
  ShieldCheck,
  Smartphone,
  UserRound,
  Users,
} from 'lucide-react';
import axios from 'axios';
import { api } from '@/shared/api/client';
import type { Customer, Device, Guardian, Loan } from '@/shared/api/types';
import { Button } from '@/shared/components/ui/Button';
import { Card, CardHeader } from '@/shared/components/ui/Card';
import { Field, Input } from '@/shared/components/ui/Field';
import { FieldGrid, FormSection } from '@/shared/components/ui/FormSection';
import { Modal } from '@/shared/components/ui/Modal';
import { StatusPill } from '@/shared/components/ui/Pill';
import { Row, Table } from '@/shared/components/ui/Table';
import { Center, EmptyState, Spinner } from '@/shared/components/ui/misc';
import { cn } from '@/shared/lib/cn';
import { money, shortDate, termLabel } from '@/shared/lib/format';
import {
  emptyPerson,
  ID_TYPES,
  PersonFields,
  useObjectUrl,
  validatePerson,
  type PersonErrors,
  type PersonForm,
} from '../components/PersonFields';

type Frequency = 'DAILY' | 'WEEKLY' | 'MONTHLY';

const REQUIRED_GUARDIANS = 3;

const FREQUENCIES: Array<{
  value: Frequency;
  label: string;
  unit: string;
  per: string;
  defaultTerm: string;
  presets: number[];
}> = [
  { value: 'DAILY', label: 'Daily', unit: 'days', per: 'daily', defaultTerm: '30', presets: [7, 14, 30, 60, 90] },
  { value: 'WEEKLY', label: 'Weekly', unit: 'weeks', per: 'weekly', defaultTerm: '12', presets: [4, 8, 12, 24] },
  { value: 'MONTHLY', label: 'Monthly', unit: 'months', per: 'monthly', defaultTerm: '6', presets: [3, 4, 6, 9, 12] },
];

const STEPS = [
  { label: 'Customer', hint: 'Who is buying on credit' },
  { label: 'Guardians', hint: 'Three people who vouch for the customer' },
  { label: 'Phone', hint: 'The phone being financed' },
  { label: 'Plan', hint: 'Price, deposit and repayment schedule' },
  { label: 'Review', hint: 'Confirm with the customer' },
] as const;
const LAST_STEP = STEPS.length - 1;

/** Mirrors backend addPeriods so the preview matches the generated schedule. */
function dueDateFor(start: string, n: number, f: Frequency): Date {
  const d = new Date(`${start}T00:00:00`);
  if (f === 'DAILY') d.setDate(d.getDate() + n);
  else if (f === 'WEEKLY') d.setDate(d.getDate() + n * 7);
  else {
    const day = d.getDate();
    d.setMonth(d.getMonth() + n);
    if (d.getDate() < day) d.setDate(0);
  }
  return d;
}

type SaleResult = {
  customer: Customer;
  device: Device & { enrollmentToken?: string };
  loan: Loan;
};

const initialSale = {
  imei: '',
  make: '',
  model: '',
  principal: '',
  downPayment: '',
  interestRate: '',
  frequency: 'MONTHLY' as Frequency,
  termPeriods: '6',
  startDate: new Date().toISOString().slice(0, 10),
  consentAccepted: false,
};
type SaleForm = typeof initialSale;

const TERMS_VERSION = 'simulinda-v1';

function buildTerms(customer: PersonForm, sale: SaleForm, totalRepayable: number) {
  const idLabel = ID_TYPES.find((t) => t.value === customer.idDocumentType)?.label ?? 'ID';
  const unit = FREQUENCIES.find((f) => f.value === sale.frequency)?.unit ?? 'months';
  return [
    'SimuLinda Credit Sale Agreement',
    `Customer: ${customer.fullName}`,
    `Phone: ${[sale.make, sale.model].filter(Boolean).join(' ') || sale.imei}`,
    `Device ID/IMEI: ${sale.imei}`,
    `${idLabel}: ${customer.nationalId}`,
    `Phone price: TZS ${Number(sale.principal || 0).toLocaleString('en-US')}`,
    `Deposit: TZS ${Number(sale.downPayment || 0).toLocaleString('en-US')}`,
    `Total repayable: TZS ${totalRepayable.toLocaleString('en-US')}`,
    `Term: ${sale.termPeriods} ${unit} (${sale.frequency.toLowerCase()} installments)`,
    'The customer agrees to pay installments on time.',
    'The customer understands that reminders will be sent before restriction.',
    'If payments are missed after the grace period, the phone may be restricted until payment is confirmed.',
    'The phone reports its last-known location to the seller while the loan is active, for follow-up on missed payments.',
    'The three guardians named in this sale were informed and may be contacted if payments are missed.',
    'Emergency access remains available and personal data is not deleted.',
    'After final settlement, the phone is released permanently to the customer.',
  ].join('\n');
}

const prefixErrors = (prefix: string, e: PersonErrors) =>
  Object.fromEntries(Object.entries(e).map(([k, v]) => [`${prefix}.${k}`, v as string]));

export default function Sales() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState<PersonForm>(emptyPerson());
  const [guardians, setGuardians] = useState<PersonForm[]>(() =>
    Array.from({ length: REQUIRED_GUARDIANS }, emptyPerson),
  );
  const [sale, setSale] = useState<SaleForm>(initialSale);
  const [activeGuardian, setActiveGuardian] = useState(0);
  const [result, setResult] = useState<SaleResult | null>(null);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [showErrors, setShowErrors] = useState(false);

  const { data: sales, isLoading } = useQuery({
    queryKey: ['loans'],
    queryFn: async () => (await api.get<Loan[]>('/loans')).data,
  });

  const { data: knownCustomers } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => (await api.get<Customer[]>('/customers')).data,
    enabled: open,
  });

  const matched = customer.phone.trim()
    ? knownCustomers?.find(
        (c) => normalizePhone(c.phone) === normalizePhone(customer.phone),
      )
    : undefined;
  const existingPhotoOk = !!matched?.selfiePhotoUrl;
  const haveGuardians = matched?._count?.guardians ?? 0;
  const neededGuardians = Math.max(REQUIRED_GUARDIANS - haveGuardians, 0);

  // Prefill blank fields from a matched customer so the seller doesn't retype.
  useEffect(() => {
    if (!matched) return;
    setCustomer((c) => ({
      ...c,
      fullName: c.fullName || matched.fullName,
      nationalId: c.nationalId || matched.nationalId || '',
      address: c.address || matched.address || '',
      idDocumentType: matched.nationalId
        ? (matched.idDocumentType ?? c.idDocumentType)
        : c.idDocumentType,
    }));
  }, [matched?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const financed = Math.max(
    (Number(sale.principal) || 0) - (Number(sale.downPayment) || 0),
    0,
  );
  const interestRate = Number(sale.interestRate) || 0;
  const totalRepayable = financed + financed * (interestRate / 100);
  const freq = FREQUENCIES.find((f) => f.value === sale.frequency)!;
  const perInstallment = totalRepayable / Math.max(Number(sale.termPeriods) || 1, 1);

  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    Object.assign(
      e,
      prefixErrors('c', validatePerson(customer, 'customer', { photoOptional: existingPhotoOk })),
    );
    const phones = [customer.phone.replace(/\D/g, '')];
    for (let i = 0; i < neededGuardians; i++) {
      const g = guardians[i];
      const ge = validatePerson(g, 'guardian');
      const digits = g.phone.replace(/\D/g, '');
      if (!ge.phone && phones.includes(digits)) {
        ge.phone = 'Must differ from the customer and other guardians';
      }
      phones.push(digits);
      Object.assign(e, prefixErrors(`g${i}`, ge));
    }
    if (sale.imei.trim().length < 4) e.imei = 'Enter the IMEI / device ID';
    if (!(Number(sale.principal) > 0)) e.principal = 'Enter the phone price';
    if (Number(sale.downPayment) >= Number(sale.principal) && Number(sale.principal) > 0)
      e.downPayment = 'Deposit must be less than the price';
    const t = Number(sale.termPeriods);
    if (!Number.isInteger(t) || t < 1) e.termPeriods = 'Enter a whole number of at least 1';
    else if (sale.frequency === 'MONTHLY' && t > 60) e.termPeriods = 'Maximum 60 months';
    else if (t > 730) e.termPeriods = 'Maximum 730';
    if (!sale.startDate) e.startDate = 'Pick a start date';
    return e;
  }, [customer, guardians, sale, existingPhotoOk, neededGuardians]);

  const stepOwns = (i: number, key: string) =>
    i === 0
      ? key.startsWith('c.')
      : i === 1
        ? /^g\d\./.test(key)
        : i === 2
          ? key === 'imei'
          : i === 3
            ? ['principal', 'downPayment', 'termPeriods', 'startDate'].includes(key)
            : false;
  const stepErrorKeys = (i: number) => Object.keys(errors).filter((k) => stepOwns(i, k));
  const personErrors = (prefix: string): PersonErrors =>
    showErrors
      ? Object.fromEntries(
          Object.entries(errors)
            .filter(([k]) => k.startsWith(`${prefix}.`))
            .map(([k, v]) => [k.slice(prefix.length + 1), v]),
        )
      : {};
  const err = (k: string) => (showErrors ? errors[k] : undefined);
  const guardianHasError = (i: number) =>
    Object.keys(errors).some((k) => k.startsWith(`g${i}.`));

  function next() {
    const bad = stepErrorKeys(step);
    if (bad.length) {
      setShowErrors(true);
      if (step === 1) {
        const first = Array.from({ length: neededGuardians }).findIndex((_, i) =>
          guardianHasError(i),
        );
        if (first >= 0) setActiveGuardian(first);
      }
      return;
    }
    setShowErrors(false);
    setStep((s) => Math.min(s + 1, LAST_STEP));
  }

  function resetAll() {
    setCustomer(emptyPerson());
    setGuardians(Array.from({ length: REQUIRED_GUARDIANS }, emptyPerson));
    setSale({ ...initialSale, startDate: new Date().toISOString().slice(0, 10) });
    setStep(0);
    setActiveGuardian(0);
    setShowErrors(false);
  }

  const createSale = useMutation({
    mutationFn: async () => {
      const phone = customer.phone.trim();
      const base = {
        fullName: customer.fullName.trim(),
        nationalId: customer.nationalId.trim(),
        idDocumentType: customer.idDocumentType,
        address: customer.address.trim(),
      };

      const existingCustomers = (await api.get<Customer[]>('/customers')).data;
      const existing = existingCustomers.find(
        (c) => normalizePhone(c.phone) === normalizePhone(phone),
      );

      let created: Customer = existing
        ? (await api.patch<Customer>(`/customers/${existing.id}`, base)).data
        : (await api.post<Customer>('/customers', { ...base, phone })).data;

      if (customer.photo) {
        const body = new FormData();
        body.append('photo', customer.photo);
        created = (await api.post<Customer>(`/customers/${created.id}/photos`, body)).data;
      }

      // Re-read how many guardians are saved (a previous attempt may have added some).
      const saved = (await api.get<Customer>(`/customers/${created.id}`)).data.guardians ?? [];
      const remaining = Math.max(REQUIRED_GUARDIANS - saved.length, 0);
      const toCreate = guardians.slice(0, neededGuardians).slice(neededGuardians - remaining);
      for (const g of toCreate) {
        const body = new FormData();
        body.append('fullName', g.fullName.trim());
        body.append('relationship', g.relationship);
        body.append('phone', g.phone.trim());
        body.append('idDocumentType', g.idDocumentType);
        body.append('nationalId', g.nationalId.trim());
        body.append('address', g.address.trim());
        body.append('photo', g.photo as File);
        await api.post<Guardian>(`/customers/${created.id}/guardians`, body);
      }

      const registered = (
        await api.post<{ device: Device; enrollmentToken: string }>('/devices', {
          imei: sale.imei.trim(),
          customerId: created.id,
          ...(sale.make.trim() ? { make: sale.make.trim() } : {}),
          ...(sale.model.trim() ? { model: sale.model.trim() } : {}),
        })
      ).data;

      const loan = (
        await api.post<Loan>('/loans', {
          customerId: created.id,
          deviceId: registered.device.id,
          principal: Number(sale.principal),
          downPayment: sale.downPayment ? Number(sale.downPayment) : 0,
          interestRate: sale.interestRate ? Number(sale.interestRate) : 0,
          frequency: sale.frequency,
          termPeriods: Number(sale.termPeriods),
          currency: 'TZS',
          startDate: new Date(sale.startDate).toISOString(),
        })
      ).data;

      await api.post('/contracts', {
        loanId: loan.id,
        language: 'en',
        termsVersion: TERMS_VERSION,
        termsText: buildTerms(customer, sale, totalRepayable),
        metadata: {
          acceptedFrom: 'dashboard-sale-wizard',
          customerPhone: phone,
          deviceImei: sale.imei,
          idDocumentType: customer.idDocumentType,
          nationalId: base.nationalId,
          principal: Number(sale.principal),
          downPayment: sale.downPayment ? Number(sale.downPayment) : 0,
          interestRate: sale.interestRate ? Number(sale.interestRate) : 0,
          frequency: sale.frequency,
          termPeriods: Number(sale.termPeriods),
        },
      });

      return {
        customer: created,
        device: { ...registered.device, enrollmentToken: registered.enrollmentToken },
        loan,
      } satisfies SaleResult;
    },
    onSuccess: (data) => {
      setResult(data);
      setOpen(false);
      resetAll();
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['devices'] });
      qc.invalidateQueries({ queryKey: ['loans'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  function closeModal() {
    if (createSale.isPending) return;
    setOpen(false);
  }

  if (isLoading) {
    return (
      <Center>
        <Spinner />
      </Center>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex justify-end gap-2">
        <Button
          onClick={() => {
            createSale.reset();
            resetAll();
            setOpen(true);
          }}
        >
          <Plus className="h-4 w-4" /> New credit sale
        </Button>
      </div>

      {result ? (
        <Card className="p-6">
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" /> Sale created
              </span>
            }
            subtitle="Next: enroll the phone with the QR on the device page (factory-reset setup)."
          />
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <div className="rounded-xl bg-canvas p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                Customer
              </p>
              <p className="mt-1 font-semibold">{result.customer.fullName}</p>
              <p className="text-sm text-muted">{result.customer.phone}</p>
            </div>
            <div className="rounded-xl bg-canvas p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                Loan
              </p>
              <p className="mt-1 font-semibold">
                {money(result.loan.principal, result.loan.currency)}
              </p>
              <p className="text-sm text-muted">
                {termLabel(result.loan)} · starts{' '}
                {shortDate(result.loan.startDate)}
              </p>
            </div>
            <div className="rounded-xl bg-canvas p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                Device
              </p>
              <p className="mt-1 font-semibold">{result.device.imei}</p>
              <p className="text-sm text-muted">
                {[result.device.make, result.device.model]
                  .filter(Boolean)
                  .join(' ') || 'Model not set'}
              </p>
            </div>
          </div>
          <div className="mt-4 rounded-xl border border-dashed border-brand-300 bg-brand-50 p-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-semibold text-brand-800">
                  <QrCode className="h-4 w-4" /> Enrollment token
                </p>
                <code className="mt-2 block break-all rounded-lg bg-white px-3 py-2 text-sm text-ink">
                  {result.device.enrollmentToken}
                </code>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() =>
                    navigator.clipboard.writeText(
                      result.device.enrollmentToken ?? '',
                    )
                  }
                >
                  <Copy className="h-4 w-4" /> Copy
                </Button>
                <Button
                  type="button"
                  onClick={() => navigate(`/devices/${result.device.id}`)}
                >
                  Open device QR
                </Button>
              </div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-sm">
            <Link
              to={`/loans/${result.loan.id}`}
              className="font-medium text-brand-700 hover:underline"
            >
              View loan schedule →
            </Link>
            <button
              type="button"
              className="text-muted hover:text-ink"
              onClick={() => setResult(null)}
            >
              Dismiss
            </button>
          </div>
        </Card>
      ) : null}

      <Card className="p-3">
        {!sales || sales.length === 0 ? (
          <EmptyState
            title="No sales yet"
            hint="A credit sale creates the customer, device, loan, and contract together."
          />
        ) : (
          <Table
            columns={[
              'Customer',
              'Device',
              'Amount',
              'Term',
              'Contract',
              'Status',
              'Started',
            ]}
          >
            {sales.map((sale) => (
              <Row key={sale.id} onClick={() => navigate(`/loans/${sale.id}`)}>
                <td className="px-4 py-3 font-medium">
                  {sale.customer?.fullName ?? '—'}
                </td>
                <td className="px-4 py-3 text-muted">
                  {sale.device?.id ? (
                    <button
                      type="button"
                      className="text-left hover:text-brand-700 hover:underline"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/devices/${sale.device!.id}`);
                      }}
                    >
                      {sale.device?.imei ?? '—'}
                      {sale.device?.model ? ` · ${sale.device.model}` : ''}
                    </button>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="px-4 py-3">
                  {money(sale.principal, sale.currency)}
                </td>
                <td className="px-4 py-3 text-muted">{termLabel(sale)}</td>
                <td className="px-4 py-3">
                  <StatusPill status={sale.contract ? 'SIGNED' : 'MISSING'} />
                </td>
                <td className="px-4 py-3">
                  <StatusPill status={sale.status} />
                </td>
                <td className="px-4 py-3 text-right text-muted">
                  {shortDate(sale.startDate)}
                </td>
              </Row>
            ))}
          </Table>
        )}
      </Card>

      <Modal
        open={open}
        onClose={closeModal}
        title="New credit sale"
        className="w-[min(96vw,48rem)] max-w-none"
        bodyClassName="flex flex-col overflow-hidden !p-0"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (step < LAST_STEP) next();
            else createSale.mutate();
          }}
          className="flex min-h-0 flex-1 flex-col"
        >
          {/* Stepper */}
          <div className="shrink-0 border-b border-line bg-canvas/40 px-4 py-3 sm:px-6">
            <ol className="flex items-center gap-2">
              {STEPS.map((s, i) => (
                <li key={s.label} className="flex flex-1 items-center gap-2 last:flex-none">
                  <span
                    className={cn(
                      'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                      i < step
                        ? 'bg-brand-600 text-white'
                        : i === step
                          ? 'bg-brand-600 text-white ring-4 ring-brand-100'
                          : 'border border-line bg-surface text-muted',
                    )}
                  >
                    {i < step ? <Check className="h-4 w-4" /> : i + 1}
                  </span>
                  <span
                    className={cn(
                      'hidden text-xs font-medium md:inline',
                      i === step ? 'text-ink' : 'text-muted',
                    )}
                  >
                    {s.label}
                  </span>
                  {i < LAST_STEP ? (
                    <span className={cn('h-px flex-1', i < step ? 'bg-brand-300' : 'bg-line')} />
                  ) : null}
                </li>
              ))}
            </ol>
            <p className="mt-2 text-xs text-muted">
              Step {step + 1} of {STEPS.length} · <span className="font-medium text-ink">{STEPS[step].label}</span>
              {' — '}
              {STEPS[step].hint}
            </p>
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-6">
            {step === 0 ? (
              <FormSection
                icon={UserRound}
                title="Customer details"
                description="Phone, photo, ID and address are all required."
              >
                <PersonFields
                  kind="customer"
                  value={customer}
                  onChange={setCustomer}
                  errors={personErrors('c')}
                  existingPhoto={existingPhotoOk}
                  photoLabel="Customer photo"
                  afterPhone={
                    matched ? (
                      <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>
                          Existing customer <b>{matched.fullName}</b> ({haveGuardians} of{' '}
                          {REQUIRED_GUARDIANS} guardians on file). Details are filled in below;
                          changes you make update their record.
                        </span>
                      </p>
                    ) : null
                  }
                />
              </FormSection>
            ) : null}

            {step === 1 ? (
              neededGuardians === 0 ? (
                <FormSection
                  icon={ShieldCheck}
                  title="Guardians already on file"
                  description={`${matched?.fullName} already has ${REQUIRED_GUARDIANS} guardians, so nothing to add.`}
                >
                  <p className="text-sm text-muted">Continue to the next step.</p>
                </FormSection>
              ) : (
                <FormSection
                  icon={Users}
                  title={`Guardian ${activeGuardian + 1} of ${neededGuardians}`}
                  description="Each guardian needs the same details as the customer, plus their relationship."
                >
                  <div role="tablist" className="mb-4 flex flex-wrap gap-2">
                    {Array.from({ length: neededGuardians }).map((_, i) => {
                      const done = !Object.keys(errors).some((k) => k.startsWith(`g${i}.`));
                      const bad = showErrors && !done;
                      return (
                        <button
                          key={i}
                          type="button"
                          role="tab"
                          aria-selected={activeGuardian === i}
                          onClick={() => setActiveGuardian(i)}
                          className={cn(
                            'inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm transition',
                            activeGuardian === i
                              ? 'border-brand-500 bg-brand-50 font-medium text-brand-800'
                              : 'border-line bg-surface text-ink hover:bg-canvas',
                            bad && 'border-rose-300',
                          )}
                        >
                          {done ? (
                            <Check className="h-3.5 w-3.5 text-emerald-600" />
                          ) : bad ? (
                            <AlertCircle className="h-3.5 w-3.5 text-rose-600" />
                          ) : (
                            <span className="h-2 w-2 rounded-full bg-line" />
                          )}
                          {guardians[i].fullName.trim().split(' ')[0] || `Guardian ${i + 1}`}
                        </button>
                      );
                    })}
                  </div>
                  <PersonFields
                    key={activeGuardian}
                    kind="guardian"
                    value={guardians[activeGuardian]}
                    onChange={(g) =>
                      setGuardians((all) => all.map((x, i) => (i === activeGuardian ? g : x)))
                    }
                    errors={personErrors(`g${activeGuardian}`)}
                    photoLabel="Guardian photo"
                  />
                </FormSection>
              )
            ) : null}

            {step === 2 ? (
              <FormSection
                icon={Smartphone}
                title="Phone being financed"
                description="Dial *#06# on the phone to see its IMEI."
              >
                <FieldGrid>
                  <div className="sm:col-span-2">
                    <Field label="IMEI / device ID" required error={err('imei')}>
                      <Input
                        value={sale.imei}
                        onChange={(e) => setSale({ ...sale, imei: e.target.value })}
                        placeholder="15-digit IMEI"
                        inputMode="numeric"
                        autoFocus
                      />
                    </Field>
                  </div>
                  <Field label="Make">
                    <Input
                      value={sale.make}
                      onChange={(e) => setSale({ ...sale, make: e.target.value })}
                      placeholder="Tecno"
                    />
                  </Field>
                  <Field label="Model">
                    <Input
                      value={sale.model}
                      onChange={(e) => setSale({ ...sale, model: e.target.value })}
                      placeholder="Spark 20"
                    />
                  </Field>
                </FieldGrid>
              </FormSection>
            ) : null}

            {step === 3 ? (
              <>
                <FormSection icon={CreditCard} title="Price & deposit">
                  <FieldGrid className="sm:grid-cols-3">
                    <Field label="Phone price (TZS)" required error={err('principal')}>
                      <Input
                        type="number"
                        min="1"
                        inputMode="numeric"
                        value={sale.principal}
                        onChange={(e) => setSale({ ...sale, principal: e.target.value })}
                      />
                    </Field>
                    <Field label="Deposit (TZS)" error={err('downPayment')}>
                      <Input
                        type="number"
                        min="0"
                        inputMode="numeric"
                        value={sale.downPayment}
                        onChange={(e) => setSale({ ...sale, downPayment: e.target.value })}
                      />
                    </Field>
                    <Field label="Flat interest (%)">
                      <Input
                        type="number"
                        min="0"
                        inputMode="decimal"
                        value={sale.interestRate}
                        onChange={(e) => setSale({ ...sale, interestRate: e.target.value })}
                      />
                    </Field>
                  </FieldGrid>
                </FormSection>

                <FormSection title="Repayment schedule" description="How often the customer pays and for how long.">
                  <div className="space-y-4">
                    <div>
                      <span className="mb-1.5 block text-sm font-medium text-ink">
                        Pays <span className="text-rose-600">*</span>
                      </span>
                      <div className="grid grid-cols-3 gap-2">
                        {FREQUENCIES.map((f) => (
                          <button
                            key={f.value}
                            type="button"
                            onClick={() =>
                              setSale({ ...sale, frequency: f.value, termPeriods: f.defaultTerm })
                            }
                            className={cn(
                              'rounded-xl border px-3 py-2.5 text-sm font-medium transition',
                              sale.frequency === f.value
                                ? 'border-brand-500 bg-brand-50 text-brand-800 ring-2 ring-brand-200'
                                : 'border-line bg-surface text-ink hover:bg-canvas',
                            )}
                          >
                            {f.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <span className="mb-1.5 block text-sm font-medium text-ink">
                        For how many {freq.unit}? <span className="text-rose-600">*</span>
                      </span>
                      <div className="flex flex-wrap items-center gap-2">
                        {freq.presets.map((n) => (
                          <button
                            key={n}
                            type="button"
                            onClick={() => setSale({ ...sale, termPeriods: String(n) })}
                            className={cn(
                              'rounded-full border px-3.5 py-1.5 text-sm transition',
                              Number(sale.termPeriods) === n
                                ? 'border-brand-500 bg-brand-50 font-medium text-brand-800'
                                : 'border-line bg-surface text-ink hover:bg-canvas',
                            )}
                          >
                            {n}
                          </button>
                        ))}
                        <Input
                          type="number"
                          min="1"
                          inputMode="numeric"
                          aria-label={`Custom number of ${freq.unit}`}
                          className="!w-24"
                          value={sale.termPeriods}
                          onChange={(e) => setSale({ ...sale, termPeriods: e.target.value })}
                        />
                      </div>
                      {err('termPeriods') ? (
                        <span className="mt-1 block text-xs text-rose-600">{err('termPeriods')}</span>
                      ) : null}
                    </div>

                    <div className="max-w-xs">
                      <Field label="Counting from" required error={err('startDate')}>
                        <Input
                          type="date"
                          value={sale.startDate}
                          onChange={(e) => setSale({ ...sale, startDate: e.target.value })}
                        />
                      </Field>
                    </div>
                  </div>
                </FormSection>

                <div className="grid grid-cols-3 gap-2 rounded-2xl border border-line bg-canvas/40 p-3 text-center">
                  <SummaryCell label="Financed" value={money(financed)} />
                  <SummaryCell label="Total repayable" value={money(totalRepayable)} emphasize />
                  <SummaryCell
                    label={`Each ${freq.unit.replace(/s$/, '')}`}
                    value={money(perInstallment)}
                  />
                </div>
              </>
            ) : null}

            {step === 4 ? (
              <>
                <FormSection icon={CheckCircle2} title="Review" description="Check everything with the customer before creating the sale.">
                  <dl className="space-y-3 text-sm">
                    <ReviewRow
                      title="Customer"
                      photo={customer.photo}
                      lines={[
                        customer.fullName,
                        customer.phone,
                        `${ID_TYPES.find((t) => t.value === customer.idDocumentType)?.label} · ${customer.nationalId}`,
                        customer.address,
                      ]}
                    />
                    {Array.from({ length: neededGuardians }).map((_, i) => (
                      <ReviewRow
                        key={i}
                        title={`Guardian ${i + 1} · ${guardians[i].relationship}`}
                        photo={guardians[i].photo}
                        lines={[
                          guardians[i].fullName,
                          guardians[i].phone,
                          `${ID_TYPES.find((t) => t.value === guardians[i].idDocumentType)?.label} · ${guardians[i].nationalId}`,
                          guardians[i].address,
                        ]}
                      />
                    ))}
                    <ReviewRow
                      title="Phone"
                      lines={[
                        [sale.make, sale.model].filter(Boolean).join(' ') || 'Phone',
                        `IMEI ${sale.imei}`,
                      ]}
                    />
                  </dl>
                </FormSection>

                <FormSection title="Payments">
                  <p className="text-sm font-semibold">
                    {money(perInstallment)} {freq.per}, {sale.termPeriods} {freq.unit}
                  </p>
                  <p className="text-sm text-muted">
                    Total {money(totalRepayable)} · deposit {money(Number(sale.downPayment) || 0)}
                  </p>
                  <ul className="mt-3 space-y-1 text-xs text-muted">
                    {previewDates(sale).map((row) => (
                      <li key={row.n} className="flex justify-between border-b border-line/60 pb-1 last:border-0">
                        <span>{row.n === 0 ? '…' : `#${row.n} · ${shortDate(row.date.toISOString())}`}</span>
                        <span>{row.n === 0 ? '' : money(perInstallment)}</span>
                      </li>
                    ))}
                  </ul>
                </FormSection>

                <FormSection title="Consent & fair-use terms">
                  <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
                    <li>Reminders are sent before any restriction.</li>
                    <li>
                      After a missed payment and grace period, the phone may be restricted
                      until payment is confirmed.
                    </li>
                    <li>The phone shares its last-known location with the seller while the loan is active.</li>
                    <li>Guardians may be contacted if payments are missed.</li>
                    <li>Emergency access remains; personal data is not deleted.</li>
                    <li>After final settlement, the phone is permanently released.</li>
                  </ul>
                  <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl bg-canvas px-3 py-3 text-sm text-ink">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 rounded border-line accent-brand-600"
                      checked={sale.consentAccepted}
                      onChange={(e) => setSale({ ...sale, consentAccepted: e.target.checked })}
                    />
                    <span>I confirm the customer accepted these SimuLinda credit-sale terms.</span>
                  </label>
                </FormSection>
              </>
            ) : null}

            {createSale.isError ? (
              <p className="flex items-start gap-2 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                {saleErrorMessage(createSale.error)}
              </p>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center justify-between gap-2 border-t border-line bg-surface px-4 py-3.5 sm:px-6">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                if (step === 0) closeModal();
                else {
                  setShowErrors(false);
                  setStep(step - 1);
                }
              }}
              disabled={createSale.isPending}
            >
              {step === 0 ? (
                'Cancel'
              ) : (
                <>
                  <ArrowLeft className="h-4 w-4" /> Back
                </>
              )}
            </Button>
            {step < LAST_STEP ? (
              <Button type="submit">
                Next <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button type="submit" disabled={createSale.isPending || !sale.consentAccepted}>
                {createSale.isPending ? 'Creating sale…' : 'Create sale & enrollment token'}
              </Button>
            )}
          </div>
        </form>
      </Modal>
    </div>
  );
}

function ReviewRow({
  title,
  lines,
  photo,
}: {
  title: string;
  lines: string[];
  photo?: File | null;
}) {
  const url = useObjectUrl(photo);
  return (
    <div className="flex items-center gap-3 rounded-xl bg-canvas p-3">
      {url ? <img src={url} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" /> : null}
      <div className="min-w-0">
        <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">{title}</dt>
        <dd className="mt-0.5 space-y-0.5">
          {lines.map((l, i) => (
            <p key={i} className={cn('truncate', i === 0 ? 'font-semibold text-ink' : 'text-muted')}>
              {l}
            </p>
          ))}
        </dd>
      </div>
    </div>
  );
}

function SummaryCell({
  label,
  value,
  emphasize,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
        {label}
      </p>
      <p
        className={cn(
          'mt-0.5 tabular-nums font-semibold',
          emphasize ? 'text-brand-700' : 'text-ink',
        )}
      >
        {value}
      </p>
    </div>
  );
}

function normalizePhone(phone: string) {
  return phone.replace(/\s+/g, '');
}

function saleErrorMessage(error: unknown) {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.message;
    if (Array.isArray(message)) return message.join(', ');
    if (typeof message === 'string') return message;
  }
  if (error instanceof Error && error.message) return error.message;
  return 'Could not create sale. Check the details and try again.';
}

/** First three installments plus a trailing ellipsis row, for the review step. */
function previewDates(form: { startDate: string; frequency: Frequency; termPeriods: string }) {
  const total = Math.max(Number(form.termPeriods) || 1, 1);
  const rows: Array<{ n: number; date: Date }> = [];
  for (let n = 1; n <= Math.min(3, total); n++) {
    rows.push({ n, date: dueDateFor(form.startDate, n, form.frequency) });
  }
  if (total > 4) rows.push({ n: 0, date: new Date() });
  if (total > 3) {
    rows.push({ n: total, date: dueDateFor(form.startDate, total, form.frequency) });
  }
  return rows;
}

