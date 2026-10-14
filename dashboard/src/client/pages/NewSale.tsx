import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  CheckCircle2,
  Copy,
  CreditCard,
  Plus,
  QrCode,
  Smartphone,
  RefreshCw,
  Upload,
  UserRound,
} from 'lucide-react';
import axios from 'axios';
import { api } from '@/shared/api/client';
import type { Customer, Device, Loan } from '@/shared/api/types';
import { Button } from '@/shared/components/ui/Button';
import { Card, CardHeader } from '@/shared/components/ui/Card';
import { Field, Input, Select } from '@/shared/components/ui/Field';
import { Modal } from '@/shared/components/ui/Modal';
import { StatusPill } from '@/shared/components/ui/Pill';
import { Row, Table } from '@/shared/components/ui/Table';
import { Center, EmptyState, Spinner } from '@/shared/components/ui/misc';
import { cn } from '@/shared/lib/cn';
import { money, shortDate, termLabel } from '@/shared/lib/format';

type IdDocumentType =
  | 'NATIONAL_ID'
  | 'VOTER_ID'
  | 'DRIVING_LICENSE'
  | 'PASSPORT';
type Frequency = 'DAILY' | 'WEEKLY' | 'MONTHLY';

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

const STEPS = ['Customer', 'Phone', 'Plan', 'Review'] as const;

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

const ID_TYPES: Array<{ value: IdDocumentType; label: string; hint: string }> = [
  { value: 'NATIONAL_ID', label: 'National ID', hint: 'NIDA / citizenship ID' },
  { value: 'VOTER_ID', label: 'Voter ID', hint: 'Voters’ card number' },
  { value: 'DRIVING_LICENSE', label: 'Driving licence', hint: 'Licence number' },
  { value: 'PASSPORT', label: 'Passport', hint: 'Passport number' },
];

const initialForm = {
  fullName: '',
  phone: '',
  idDocumentType: 'NATIONAL_ID' as IdDocumentType,
  nationalId: '',
  address: '',
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

const TERMS_VERSION = 'simulinda-v1';

function buildTerms(form: typeof initialForm, totalRepayable: number) {
  const idLabel =
    ID_TYPES.find((t) => t.value === form.idDocumentType)?.label ?? 'ID';
  return [
    'SimuLinda Credit Sale Agreement',
    `Customer: ${form.fullName}`,
    `Phone: ${[form.make, form.model].filter(Boolean).join(' ') || form.imei}`,
    `Device ID/IMEI: ${form.imei}`,
    `${idLabel}: ${form.nationalId}`,
    `Phone price: TZS ${Number(form.principal || 0).toLocaleString('en-US')}`,
    `Deposit: TZS ${Number(form.downPayment || 0).toLocaleString('en-US')}`,
    `Total repayable: TZS ${totalRepayable.toLocaleString('en-US')}`,
    `Term: ${form.termPeriods} ${FREQUENCIES.find((f) => f.value === form.frequency)?.unit ?? 'months'} (${form.frequency.toLowerCase()} installments)`,
    'The customer agrees to pay installments on time.',
    'The customer understands that reminders will be sent before restriction.',
    'If payments are missed after the grace period, the phone may be restricted until payment is confirmed.',
    'The phone reports its last-known location to the seller while the loan is active, for follow-up on missed payments.',
    'Emergency access remains available and personal data is not deleted.',
    'After final settlement, the phone is released permanently to the customer.',
  ].join('\n');
}

export default function Sales() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [form, setForm] = useState(initialForm);
  const [result, setResult] = useState<SaleResult | null>(null);
  const [open, setOpen] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  const [step, setStep] = useState(0);
  const [showErrors, setShowErrors] = useState(false);

  const { data: sales, isLoading } = useQuery({
    queryKey: ['loans'],
    queryFn: async () => (await api.get<Loan[]>('/loans')).data,
  });

  const financed = Math.max(
    (Number(form.principal) || 0) - (Number(form.downPayment) || 0),
    0,
  );
  const interestRate = Number(form.interestRate) || 0;
  const totalRepayable = financed + financed * (interestRate / 100);
  const freq = FREQUENCIES.find((f) => f.value === form.frequency)!;
  const perInstallment =
    totalRepayable / Math.max(Number(form.termPeriods) || 1, 1);

  // An existing customer who already has a photo on file doesn't need a new one.
  const { data: knownCustomers } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => (await api.get<Customer[]>('/customers')).data,
    enabled: open,
  });
  const existingPhotoOk = !!knownCustomers?.find(
    (c) => normalizePhone(c.phone) === normalizePhone(form.phone),
  )?.selfiePhotoUrl;

  const matched = form.phone.trim()
    ? knownCustomers?.find(
        (c) => normalizePhone(c.phone) === normalizePhone(form.phone),
      )
    : undefined;

  // Prefill blank fields from a matched customer so the seller doesn't retype.
  useEffect(() => {
    if (!matched) return;
    setForm((f) => ({
      ...f,
      fullName: f.fullName || matched.fullName,
      nationalId: f.nationalId || matched.nationalId || '',
      address: f.address || matched.address || '',
      idDocumentType: matched.nationalId
        ? ((matched.idDocumentType as IdDocumentType | null) ?? f.idDocumentType)
        : f.idDocumentType,
    }));
  }, [matched?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const photoUrl = useMemo(
    () => (photo ? URL.createObjectURL(photo) : null),
    [photo],
  );

  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    if (form.fullName.trim().length < 2) e.fullName = 'Enter the full name';
    if (form.phone.replace(/\D/g, '').length < 7) e.phone = 'Enter a valid phone number';
    if (form.nationalId.trim().length < 4) e.nationalId = 'Enter the ID number';
    if (form.address.trim().length < 3) e.address = 'Enter the physical address';
    if (!photo && !existingPhotoOk) e.photo = 'Take or upload a photo of the customer';
    if (form.imei.trim().length < 4) e.imei = 'Enter the IMEI / device ID';
    if (!(Number(form.principal) > 0)) e.principal = 'Enter the phone price';
    if (Number(form.downPayment) >= Number(form.principal) && Number(form.principal) > 0)
      e.downPayment = 'Deposit must be less than the price';
    const t = Number(form.termPeriods);
    if (!Number.isInteger(t) || t < 1) e.termPeriods = 'Enter a whole number of at least 1';
    else if (form.frequency === 'MONTHLY' && t > 60) e.termPeriods = 'Maximum 60 months';
    else if (t > 730) e.termPeriods = 'Maximum 730';
    if (!form.startDate) e.startDate = 'Pick a start date';
    return e;
  }, [form, photo, existingPhotoOk]);

  const stepFields: string[][] = [
    ['fullName', 'phone', 'nationalId', 'address', 'photo'],
    ['imei'],
    ['principal', 'downPayment', 'termPeriods', 'startDate'],
    [],
  ];
  const stepHasErrors = (i: number) => stepFields[i].some((k) => errors[k]);
  const err = (k: string) => (showErrors ? errors[k] : undefined);

  function next() {
    if (stepHasErrors(step)) {
      setShowErrors(true);
      return;
    }
    setShowErrors(false);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  const idPlaceholder = useMemo(() => {
    switch (form.idDocumentType) {
      case 'VOTER_ID':
        return 'e.g. T-1234-5678-9012';
      case 'DRIVING_LICENSE':
        return 'e.g. 4001234567';
      case 'PASSPORT':
        return 'e.g. AB123456';
      default:
        return 'e.g. 19850615-12345-00001-23';
    }
  }, [form.idDocumentType]);

  const createSale = useMutation({
    mutationFn: async () => {
      const phone = form.phone.trim();
      const nationalId = form.nationalId.trim();
      if (!nationalId) throw new Error('Person ID is required');
      if (!phone) throw new Error('Phone number is required');
      if (!form.address.trim()) throw new Error('Physical address is required');
      if (!photo && !existingPhotoOk) throw new Error('Customer photo is required');

      const existingCustomers = (await api.get<Customer[]>('/customers')).data;
      const existing = existingCustomers.find(
        (c) => normalizePhone(c.phone) === normalizePhone(phone),
      );

      let customer: Customer;
      if (existing) {
        customer = (
          await api.patch<Customer>(`/customers/${existing.id}`, {
            fullName: form.fullName.trim(),
            nationalId,
            idDocumentType: form.idDocumentType,
            address: form.address.trim(),
          })
        ).data;
      } else {
        customer = (
          await api.post<Customer>('/customers', {
            fullName: form.fullName.trim(),
            phone,
            nationalId,
            idDocumentType: form.idDocumentType,
            address: form.address.trim(),
          })
        ).data;
      }

      if (photo) {
        const body = new FormData();
        body.append('photo', photo);
        customer = (
          await api.post<Customer>(`/customers/${customer.id}/photos`, body)
        ).data;
      }

      const registered = (
        await api.post<{ device: Device; enrollmentToken: string }>('/devices', {
          imei: form.imei.trim(),
          customerId: customer.id,
          ...(form.make.trim() ? { make: form.make.trim() } : {}),
          ...(form.model.trim() ? { model: form.model.trim() } : {}),
        })
      ).data;

      const loan = (
        await api.post<Loan>('/loans', {
          customerId: customer.id,
          deviceId: registered.device.id,
          principal: Number(form.principal),
          downPayment: form.downPayment ? Number(form.downPayment) : 0,
          interestRate: form.interestRate ? Number(form.interestRate) : 0,
          frequency: form.frequency,
          termPeriods: Number(form.termPeriods),
          currency: 'TZS',
          startDate: new Date(form.startDate).toISOString(),
        })
      ).data;

      await api.post('/contracts', {
        loanId: loan.id,
        language: 'en',
        termsVersion: TERMS_VERSION,
        termsText: buildTerms(form, totalRepayable),
        metadata: {
          acceptedFrom: 'dashboard-sale-wizard',
          customerPhone: form.phone,
          deviceImei: form.imei,
          idDocumentType: form.idDocumentType,
          nationalId,
          principal: Number(form.principal),
          downPayment: form.downPayment ? Number(form.downPayment) : 0,
          interestRate: form.interestRate ? Number(form.interestRate) : 0,
          frequency: form.frequency,
          termPeriods: Number(form.termPeriods),
        },
      });

      return {
        customer,
        device: {
          ...registered.device,
          enrollmentToken: registered.enrollmentToken,
        },
        loan,
      } satisfies SaleResult;
    },
    onSuccess: (data) => {
      setResult(data);
      setOpen(false);
      setForm(initialForm);
      setPhoto(null);
      setStep(0);
      setShowErrors(false);
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
            setStep(0);
            setShowErrors(false);
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
        className="w-[min(96vw,44rem)] max-w-none"
        bodyClassName="flex flex-col overflow-hidden !p-0"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (step < STEPS.length - 1) next();
            else createSale.mutate();
          }}
          className="flex min-h-0 flex-1 flex-col"
        >
          {/* Progress */}
          <ol className="flex shrink-0 items-center gap-2 border-b border-line px-6 py-3">
            {STEPS.map((label, i) => (
              <li key={label} className="flex flex-1 items-center gap-2">
                <span
                  className={cn(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                    i < step
                      ? 'bg-brand-600 text-white'
                      : i === step
                        ? 'bg-brand-100 text-brand-700 ring-2 ring-brand-400'
                        : 'bg-canvas text-muted',
                  )}
                >
                  {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </span>
                <span
                  className={cn(
                    'hidden text-xs font-medium sm:inline',
                    i === step ? 'text-ink' : 'text-muted',
                  )}
                >
                  {label}
                </span>
                {i < STEPS.length - 1 ? (
                  <span className="h-px flex-1 bg-line" />
                ) : null}
              </li>
            ))}
          </ol>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
            {step === 0 ? (
              <section className="space-y-4">
                <SectionTitle
                  icon={UserRound}
                  title="Customer"
                  subtitle="All fields are required"
                />
                <Field label="Phone / mobile money" required error={err('phone')}>
                  <Input
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="+255 7XX XXX XXX"
                    inputMode="tel"
                    autoFocus
                  />
                </Field>
                {matched ? (
                  <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      Existing customer <b>{matched.fullName}</b>. Their details are
                      filled in below; any change you make will update their record.
                    </span>
                  </p>
                ) : null}
                <Field label="Full name" required error={err('fullName')}>
                  <Input
                    value={form.fullName}
                    onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                    placeholder="Asha Mwakalinga"
                  />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="ID type" required>
                    <Select
                      value={form.idDocumentType}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          idDocumentType: e.target.value as IdDocumentType,
                        })
                      }
                    >
                      {ID_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="ID number" required error={err('nationalId')}>
                    <Input
                      value={form.nationalId}
                      onChange={(e) =>
                        setForm({ ...form, nationalId: e.target.value })
                      }
                      placeholder={idPlaceholder}
                    />
                  </Field>
                </div>
                <Field label="Physical address" required error={err('address')}>
                  <Input
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    placeholder="Street, ward, city"
                  />
                </Field>
                <PhotoCapture
                  url={photoUrl}
                  hasExisting={existingPhotoOk}
                  error={err('photo')}
                  onChange={setPhoto}
                />
              </section>
            ) : null}

            {step === 1 ? (
              <section className="space-y-4">
                <SectionTitle
                  icon={Smartphone}
                  title="Phone being financed"
                  subtitle="Dial *#06# on the phone to see its IMEI"
                />
                <Field label="IMEI / device ID" required error={err('imei')}>
                  <Input
                    value={form.imei}
                    onChange={(e) => setForm({ ...form, imei: e.target.value })}
                    placeholder="15-digit IMEI"
                    inputMode="numeric"
                    autoFocus
                  />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Make">
                    <Input
                      value={form.make}
                      onChange={(e) => setForm({ ...form, make: e.target.value })}
                      placeholder="Tecno"
                    />
                  </Field>
                  <Field label="Model">
                    <Input
                      value={form.model}
                      onChange={(e) => setForm({ ...form, model: e.target.value })}
                      placeholder="Spark 20"
                    />
                  </Field>
                </div>
              </section>
            ) : null}

            {step === 2 ? (
              <section className="space-y-4">
                <SectionTitle
                  icon={CreditCard}
                  title="Repayment plan"
                  subtitle="Price, deposit and how often the customer pays"
                />
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Phone price (TZS)" required error={err('principal')}>
                    <Input
                      type="number"
                      min="1"
                      inputMode="numeric"
                      value={form.principal}
                      onChange={(e) =>
                        setForm({ ...form, principal: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="Deposit (TZS)" error={err('downPayment')}>
                    <Input
                      type="number"
                      min="0"
                      inputMode="numeric"
                      value={form.downPayment}
                      onChange={(e) =>
                        setForm({ ...form, downPayment: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="Flat interest (%)">
                    <Input
                      type="number"
                      min="0"
                      inputMode="decimal"
                      value={form.interestRate}
                      onChange={(e) =>
                        setForm({ ...form, interestRate: e.target.value })
                      }
                    />
                  </Field>
                </div>

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
                          setForm({
                            ...form,
                            frequency: f.value,
                            termPeriods: f.defaultTerm,
                          })
                        }
                        className={cn(
                          'rounded-xl border px-3 py-2.5 text-sm font-medium transition',
                          form.frequency === f.value
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
                        onClick={() => setForm({ ...form, termPeriods: String(n) })}
                        className={cn(
                          'rounded-full border px-3.5 py-1.5 text-sm transition',
                          Number(form.termPeriods) === n
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
                      value={form.termPeriods}
                      onChange={(e) =>
                        setForm({ ...form, termPeriods: e.target.value })
                      }
                    />
                  </div>
                  {err('termPeriods') ? (
                    <span className="mt-1 block text-xs text-rose-600">
                      {err('termPeriods')}
                    </span>
                  ) : null}
                </div>

                <Field label="First payment counts from" required error={err('startDate')}>
                  <Input
                    type="date"
                    value={form.startDate}
                    onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                  />
                </Field>

                <div className="grid grid-cols-3 gap-2 rounded-xl border border-line bg-surface p-3 text-center">
                  <SummaryCell label="Financed" value={money(financed)} />
                  <SummaryCell
                    label="Total repayable"
                    value={money(totalRepayable)}
                    emphasize
                  />
                  <SummaryCell
                    label={`Each ${freq.unit.replace(/s$/, '')}`}
                    value={money(perInstallment)}
                  />
                </div>
              </section>
            ) : null}

            {step === 3 ? (
              <section className="space-y-4">
                <SectionTitle
                  icon={CheckCircle2}
                  title="Review & confirm"
                  subtitle="Check everything with the customer before creating the sale"
                />
                <div className="flex items-center gap-3 rounded-xl bg-canvas p-3">
                  {photoUrl ? (
                    <img
                      src={photoUrl}
                      alt="Customer"
                      className="h-14 w-14 rounded-xl object-cover"
                    />
                  ) : null}
                  <div className="min-w-0 text-sm">
                    <p className="font-semibold">{form.fullName}</p>
                    <p className="text-muted">{form.phone}</p>
                    <p className="truncate text-muted">
                      {ID_TYPES.find((t) => t.value === form.idDocumentType)?.label}{' '}
                      · {form.nationalId} · {form.address}
                    </p>
                  </div>
                </div>
                <div className="rounded-xl bg-canvas p-3 text-sm">
                  <p className="font-semibold">
                    {[form.make, form.model].filter(Boolean).join(' ') || 'Phone'}
                  </p>
                  <p className="text-muted">IMEI {form.imei}</p>
                </div>

                <div className="rounded-xl border border-line p-3 text-sm">
                  <p className="font-semibold">
                    {money(perInstallment)} {freq.per}, {form.termPeriods} {freq.unit}
                  </p>
                  <p className="text-muted">
                    Total {money(totalRepayable)} · deposit{' '}
                    {money(Number(form.downPayment) || 0)}
                  </p>
                  <ul className="mt-2 space-y-0.5 text-xs text-muted">
                    {previewDates(form).map((row) => (
                      <li key={row.n} className="flex justify-between">
                        <span>{row.n === 0 ? '…' : `#${row.n}`}</span>
                        <span>
                          {row.n === 0 ? '' : shortDate(row.date.toISOString())}
                          {row.n === 0 ? '' : ` · ${money(perInstallment)}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
                  <li>Reminders are sent before any restriction.</li>
                  <li>
                    After a missed payment and grace period, the phone may be
                    restricted until payment is confirmed.
                  </li>
                  <li>
                    The phone shares its last-known location with the seller while
                    the loan is active.
                  </li>
                  <li>Emergency access remains; personal data is not deleted.</li>
                  <li>After final settlement, the phone is permanently released.</li>
                </ul>
                <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-canvas px-3 py-3 text-sm text-ink">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-line accent-brand-600"
                    checked={form.consentAccepted}
                    onChange={(e) =>
                      setForm({ ...form, consentAccepted: e.target.checked })
                    }
                  />
                  <span>
                    I confirm the customer accepted these SimuLinda credit-sale
                    terms.
                  </span>
                </label>
              </section>
            ) : null}

            {createSale.isError ? (
              <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {saleErrorMessage(createSale.error)}
              </p>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center justify-between gap-2 border-t border-line bg-surface px-6 py-4">
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
            {step < STEPS.length - 1 ? (
              <Button type="submit">
                Next <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                type="submit"
                disabled={createSale.isPending || !form.consentAccepted}
              >
                {createSale.isPending
                  ? 'Creating sale…'
                  : 'Create sale & enrollment token'}
              </Button>
            )}
          </div>
        </form>
      </Modal>
    </div>
  );
}

function SectionTitle({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: typeof UserRound;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
        <Icon className="h-4 w-4" />
      </span>
      <div>
        <p className="font-semibold text-ink">{title}</p>
        <p className="text-xs text-muted">{subtitle}</p>
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

function PhotoCapture({
  url,
  hasExisting,
  error,
  onChange,
}: {
  url: string | null;
  hasExisting: boolean;
  error?: string;
  onChange: (f: File | null) => void;
}) {
  const accept = 'image/jpeg,image/png,image/webp';
  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-ink">
        Customer photo <span className="text-rose-600">*</span>
      </span>
      <div
        className={cn(
          'flex flex-col items-center gap-3 rounded-2xl border border-dashed p-4 sm:flex-row',
          error ? 'border-rose-300 bg-rose-50/50' : 'border-line bg-canvas/40',
        )}
      >
        {url ? (
          <img
            src={url}
            alt="Customer preview"
            className="h-32 w-32 rounded-2xl object-cover"
          />
        ) : (
          <span className="flex h-32 w-32 items-center justify-center rounded-2xl bg-canvas text-muted">
            <Camera className="h-8 w-8" />
          </span>
        )}
        <div className="flex flex-1 flex-col items-center gap-2 sm:items-start">
          <p className="text-xs text-muted">
            {url
              ? 'Looks good? You can retake it.'
              : hasExisting
                ? 'A photo is already on file for this customer. Add a new one only if needed.'
                : 'Face clearly visible, good light.'}
          </p>
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
              {url ? <RefreshCw className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
              {url ? 'Retake' : 'Take photo'}
              <input
                type="file"
                accept={accept}
                capture="user"
                className="sr-only"
                onChange={(e) => {
                  onChange(e.target.files?.[0] ?? null);
                  e.target.value = '';
                }}
              />
            </label>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2 text-sm font-medium text-ink hover:bg-canvas">
              <Upload className="h-4 w-4" /> Upload
              <input
                type="file"
                accept={accept}
                className="sr-only"
                onChange={(e) => {
                  onChange(e.target.files?.[0] ?? null);
                  e.target.value = '';
                }}
              />
            </label>
          </div>
        </div>
      </div>
      {error ? <span className="mt-1 block text-xs text-rose-600">{error}</span> : null}
    </div>
  );
}
