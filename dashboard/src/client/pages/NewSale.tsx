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
  Loader2,
  Plus,
  QrCode,
  Smartphone,
  UserRound,
} from '@/shared/icons';
import axios from 'axios';
import { api } from '@/shared/api/client';
import { useAuth } from '@/shared/auth/AuthContext';
import type { Customer, Device, Loan } from '@/shared/api/types';
import { Button } from '@/shared/components/ui/Button';
import { Card, CardHeader } from '@/shared/components/ui/Card';
import { Field, Input } from '@/shared/components/ui/Field';
import { FieldGrid, FormSection } from '@/shared/components/ui/FormSection';
import { Modal } from '@/shared/components/ui/Modal';
import { StatusDot } from '@/shared/components/ui/Pill';
import { FigureStrip } from '@/shared/components/FigureStrip';
import { ListToolbar } from '@/shared/components/ListToolbar';
import { PanelEmpty } from '@/shared/components/Panel';
import { Row, Table } from '@/shared/components/ui/Table';
import { Center, EmptyState, Spinner } from '@/shared/components/ui/misc';
import { cn } from '@/shared/lib/cn';
import { money, shortDate, termLabel } from '@/shared/lib/format';
import { ID_TYPES, useObjectUrl } from '../components/PersonFields';

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
  { label: 'Customer', hint: 'Pick a verified customer' },
  { label: 'Phone', hint: 'Pick the phone from stock' },
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
  /** Stock phone picked at the counter (registered ahead on Register phones). */
  deviceId: '',
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

function buildTerms(customer: Customer, sale: SaleForm, totalRepayable: number) {
  const idLabel = ID_TYPES.find((t) => t.value === customer.idDocumentType)?.label ?? 'ID';
  const unit = FREQUENCIES.find((f) => f.value === sale.frequency)?.unit ?? 'months';
  return [
    'SimuLinda Credit Sale Agreement',
    `Customer: ${customer.fullName}`,
    `Phone: ${[sale.make, sale.model].filter(Boolean).join(' ') || sale.imei}`,
    `Device ID/IMEI: ${sale.imei}`,
    `${idLabel}: ${customer.nationalId ?? ''}`,
    `Phone price: TZS ${Number(sale.principal || 0).toLocaleString('en-US')}`,
    `Deposit: TZS ${Number(sale.downPayment || 0).toLocaleString('en-US')}`,
    `Total repayable: TZS ${totalRepayable.toLocaleString('en-US')}`,
    `Term: ${sale.termPeriods} ${unit} (${sale.frequency.toLowerCase()} installments)`,
    'The customer agrees to pay installments on time.',
    'The customer understands that reminders will be sent before restriction.',
    'If payments are missed after the grace period, the phone may be restricted until payment is confirmed.',
    'The phone reports its last-known location to the seller while the loan is active, for follow-up on missed payments.',
    'The guardians recorded for this customer may be contacted if payments are missed.',
    'Emergency access remains available and personal data is not deleted.',
    'After final settlement, the phone is released permanently to the customer.',
  ].join('\n');
}

export default function Sales() {
  const { user } = useAuth();
  const isAgent = user?.role === 'AGENT';
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [customerId, setCustomerId] = useState('');
  const [customerQuery, setCustomerQuery] = useState('');
  const [customerOpen, setCustomerOpen] = useState(false);
  const [sale, setSale] = useState<SaleForm>(initialSale);
  const [result, setResult] = useState<SaleResult | null>(null);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [showErrors, setShowErrors] = useState(false);
  const [saleQuery, setSaleQuery] = useState('');
  const [saleStatus, setSaleStatus] = useState('ALL');

  const { data: sales, isLoading } = useQuery({
    queryKey: ['loans'],
    queryFn: async () => (await api.get<Loan[]>('/loans')).data,
  });

  const saleStats = useMemo(() => {
    const all = sales ?? [];
    return {
      total: all.length,
      active: all.filter((l) => l.status === 'ACTIVE').length,
      financed: all.reduce((t, l) => t + Number(l.principal), 0),
      noContract: all.filter((l) => !l.contract).length,
    };
  }, [sales]);

  const saleRows = useMemo(() => {
    const q = saleQuery.trim().toLowerCase();
    return (sales ?? []).filter((l) => {
      if (saleStatus !== 'ALL' && l.status !== saleStatus) return false;
      if (!q) return true;
      return [l.customer?.fullName, l.device?.imei, l.device?.model]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [sales, saleQuery, saleStatus]);

  const { data: knownCustomers } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => (await api.get<Customer[]>('/customers')).data,
    enabled: open,
  });

  // Registered, unsold phones. Agents only get the ones allocated to them.
  const { data: stock, isLoading: stockLoading } = useQuery({
    queryKey: ['devices', 'available'],
    queryFn: async () =>
      (await api.get<Device[]>('/devices', { params: { available: 'true' } })).data,
    enabled: open,
  });
  const [stockQuery, setStockQuery] = useState('');
  const stockRows = useMemo(() => {
    const q = stockQuery.trim().toLowerCase();
    return (stock ?? []).filter(
      (d) =>
        !q ||
        [d.imei, d.make, d.model].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [stock, stockQuery]);

  const customer = knownCustomers?.find((c) => c.id === customerId) ?? null;
  const canSellTo = (c: Customer) =>
    c.verificationStatus === 'VERIFIED' && (c._count?.guardians ?? 0) >= REQUIRED_GUARDIANS;
  const customerRows = useMemo(() => {
    const q = customerQuery.trim().toLowerCase();
    return (knownCustomers ?? [])
      .filter(canSellTo)
      .filter(
        (c) =>
          !q ||
          [c.fullName, c.phone, c.nationalId].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)),
      );
  }, [knownCustomers, customerQuery]);
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
    if (!customer || !canSellTo(customer)) e.customer = 'Pick the customer';
    if (!sale.deviceId) e.imei = 'Pick the phone being sold';
    if (!(Number(sale.principal) > 0)) e.principal = 'Enter the phone price';
    if (Number(sale.downPayment) >= Number(sale.principal) && Number(sale.principal) > 0)
      e.downPayment = 'Deposit must be less than the price';
    const t = Number(sale.termPeriods);
    if (!Number.isInteger(t) || t < 1) e.termPeriods = 'Enter a whole number of at least 1';
    else if (sale.frequency === 'MONTHLY' && t > 60) e.termPeriods = 'Maximum 60 months';
    else if (t > 730) e.termPeriods = 'Maximum 730';
    if (!sale.startDate) e.startDate = 'Pick a start date';
    return e;
  }, [customer, sale]);

  const stepOwns = (i: number, key: string) =>
    i === 0
      ? key === 'customer'
      : i === 1
        ? key === 'imei'
        : i === 2
          ? ['principal', 'downPayment', 'termPeriods', 'startDate'].includes(key)
          : false;
  const stepErrorKeys = (i: number) => Object.keys(errors).filter((k) => stepOwns(i, k));
  const err = (k: string) => (showErrors ? errors[k] : undefined);
  function next() {
    const bad = stepErrorKeys(step);
    if (bad.length) {
      setShowErrors(true);
      return;
    }
    setShowErrors(false);
    setStep((s) => Math.min(s + 1, LAST_STEP));
  }

  function resetAll() {
    setCustomerId('');
    setCustomerQuery('');
    setCustomerOpen(false);
    setSale({ ...initialSale, startDate: new Date().toISOString().slice(0, 10) });
    setStep(0);
    setShowErrors(false);
    setStockQuery('');
  }

  const createSale = useMutation({
    mutationFn: async () => {
      if (!customer) throw new Error('Pick a customer');
      const created = customer;
      const phone = customer.phone;
      const base = { nationalId: customer.nationalId ?? '' };

      // The phone was registered ahead of time; fetch it for its enrollment token.
      const registered = (await api.get<Device>(`/devices/${sale.deviceId}`)).data;

      const loan = (
        await api.post<Loan>('/loans', {
          customerId: created.id,
          deviceId: registered.id,
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
        device: { ...registered, enrollmentToken: registered.enrollToken?.token },
        loan,
      } satisfies SaleResult;
    },
    onSuccess: (data) => {
      setResult(data);
      setOpen(false);
      resetAll();
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['devices'] });
      qc.invalidateQueries({ queryKey: ['agents'] });
      qc.invalidateQueries({ queryKey: ['agent'] });
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

  // Anything typed (or any step past the first) counts as work worth protecting.
  const hasUnsavedInput =
    open &&
    !createSale.isSuccess &&
    (step > 0 || !!customerId || !!sale.deviceId);

  const modalFooter = (
    <>
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
        <Button type="submit" form="credit-sale-form">
          Next <ArrowRight className="h-4 w-4" />
        </Button>
      ) : (
        <Button
          type="submit"
          form="credit-sale-form"
          disabled={createSale.isPending || !sale.consentAccepted}
        >
          {createSale.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Creating sale…
            </>
          ) : (
            'Create sale'
          )}
        </Button>
      )}
    </>
  );

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
          <div className="mt-4 rounded-xl border border-dashed border-brand-300/60 bg-brand-600/10 p-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-semibold text-brand-700">
                  <QrCode className="h-4 w-4" /> Enrollment token
                </p>
                <code className="mt-2 block break-all rounded-lg bg-elevated px-3 py-2 text-sm text-ink">
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
              to={`/sales/${result.loan.id}`}
              className="inline-flex items-center gap-1 font-medium text-brand-600 hover:underline"
            >
              View loan schedule <ArrowRight className="h-3.5 w-3.5" />
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

      <FigureStrip
        items={[
          { label: 'Total sales', value: saleStats.total },
          { label: 'Active loans', value: saleStats.active },
          { label: 'Total financed', value: money(saleStats.financed) },
          { label: 'Without contract', value: saleStats.noContract },
        ]}
      />

      <Card>
        <ListToolbar
          title="All sales"
          noun="sale"
          count={saleRows.length}
          query={saleQuery}
          onQuery={setSaleQuery}
          placeholder="Search customer, IMEI, model"
          filter={{
            value: saleStatus,
            onChange: setSaleStatus,
            options: [
              { value: 'ALL', label: 'All statuses' },
              { value: 'ACTIVE', label: 'Active' },
              { value: 'COMPLETED', label: 'Completed' },
              { value: 'DEFAULTED', label: 'Defaulted' },
              { value: 'CANCELLED', label: 'Cancelled' },
            ],
          }}
        />
        {!sales || sales.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title="No sales yet"
              hint="A credit sale sells a stocked phone to a verified customer and creates the loan and contract."
            />
          </div>
        ) : saleRows.length === 0 ? (
          <PanelEmpty>No sales match your search.</PanelEmpty>
        ) : (
          <Table columns={['Customer', 'Device', 'Amount', 'Term', ...(isAgent ? [] : ['Sold by']), 'Contract', 'Status', 'Started']}>
            {saleRows.map((sale) => (
              <Row key={sale.id} onClick={() => navigate(`/sales/${sale.id}`)}>
                <td className="px-4 py-3 font-medium text-ink">{sale.customer?.fullName ?? '—'}</td>
                <td className="px-4 py-3 text-muted">
                  {sale.device?.imei ?? '—'}
                  {sale.device?.model ? ` · ${sale.device.model}` : ''}
                </td>
                <td className="px-4 py-3 tabular-nums">{money(sale.principal, sale.currency)}</td>
                <td className="px-4 py-3 text-muted">{termLabel(sale)}</td>
                {isAgent ? null : (
                  <td className="px-4 py-3 text-muted">{sale.soldBy?.fullName ?? '—'}</td>
                )}
                <td className="px-4 py-3">
                  <StatusDot status={sale.contract ? 'SIGNED' : 'MISSING'} />
                </td>
                <td className="px-4 py-3"><StatusDot status={sale.status} /></td>
                <td className="px-4 py-3 text-right text-muted">{shortDate(sale.startDate)}</td>
              </Row>
            ))}
          </Table>
        )}
      </Card>

      <Modal
        open={open}
        onClose={closeModal}
        title="New credit sale"
        subtitle={`Step ${step + 1} of ${STEPS.length} · ${STEPS[step].label}`}
        size="lg"
        dirty={hasUnsavedInput}
        footer={modalFooter}
      >
        <form
          id="credit-sale-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (step < LAST_STEP) next();
            else createSale.mutate();
          }}
          className="flex flex-col gap-6"
        >
          <StepBar step={step} />

          <div className="space-y-6">
            {step === 0 ? (
              <FormSection icon={UserRound} title="Customer" description="Search and pick the customer buying on credit.">
                <div className="relative">
                  <Input
                    value={customer && !customerOpen ? `${customer.fullName} · ${customer.phone}` : customerQuery}
                    onChange={(e) => {
                      setCustomerQuery(e.target.value);
                      setCustomerId('');
                      setCustomerOpen(true);
                    }}
                    onFocus={() => {
                      setCustomerOpen(true);
                      if (customer) setCustomerQuery('');
                    }}
                    onBlur={() => setTimeout(() => setCustomerOpen(false), 120)}
                    placeholder="Search name, phone or ID number"
                    autoFocus
                    autoComplete="off"
                  />
                  {customerOpen ? (
                    <ul className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-line bg-surface shadow-lg">
                      {customerRows.length === 0 ? (
                        <li className="px-4 py-3 text-sm text-muted">
                          {knownCustomers && knownCustomers.some(canSellTo)
                            ? 'No customer matches that search.'
                            : 'No customer is ready yet. Verify a customer on the Customers page first.'}
                        </li>
                      ) : (
                        customerRows.map((c) => (
                          <li key={c.id}>
                            <button
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => {
                                setCustomerId(c.id);
                                setCustomerOpen(false);
                              }}
                              className="flex w-full flex-col px-4 py-2.5 text-left text-sm hover:bg-canvas/60"
                            >
                              <span className="font-medium text-ink">{c.fullName}</span>
                              <span className="text-xs text-muted">{c.phone}</span>
                            </button>
                          </li>
                        ))
                      )}
                    </ul>
                  ) : null}
                </div>
                {err('customer') ? <p className="text-xs text-rose-600">{err('customer')}</p> : null}
              </FormSection>
            ) : null}

            {step === 1 ? (
              <FormSection
                icon={Smartphone}
                title="Phone being financed"
                description="Choose one of the phones registered in stock. Check the IMEI against the box (dial *#06# on the phone)."
              >
                <Input
                  value={stockQuery}
                  onChange={(e) => setStockQuery(e.target.value)}
                  placeholder="Search IMEI or model"
                  autoFocus
                />
                {stockLoading ? (
                  <Center>
                    <Spinner />
                  </Center>
                ) : !stock || stock.length === 0 ? (
                  <EmptyState
                    title="No phones in stock"
                    hint={
                      isAgent
                        ? 'Ask the owner to give you phones to sell.'
                        : 'Register phones first, then come back to complete the sale.'
                    }
                  />
                ) : stockRows.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted">No phone matches that search.</p>
                ) : (
                  <ul
                    role="radiogroup"
                    aria-label="Phones in stock"
                    className="max-h-72 divide-y divide-line overflow-y-auto rounded-xl border border-line"
                  >
                    {stockRows.map((d) => (
                      <li key={d.id}>
                        <label
                          className={cn(
                            'flex cursor-pointer items-center gap-3 px-4 py-2.5 text-sm hover:bg-canvas/60',
                            sale.deviceId === d.id && 'bg-brand-600/10',
                          )}
                        >
                          <input
                            type="radio"
                            name="stock-phone"
                            className="h-4 w-4 accent-brand-600"
                            checked={sale.deviceId === d.id}
                            onChange={() =>
                              setSale({
                                ...sale,
                                deviceId: d.id,
                                imei: d.imei,
                                make: d.make ?? '',
                                model: d.model ?? '',
                              })
                            }
                          />
                          <span className="font-medium tabular-nums text-ink">{d.imei}</span>
                          <span className="text-muted">
                            {[d.make, d.model].filter(Boolean).join(' ') || 'Model not set'}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
                {err('imei') ? (
                  <span className="block text-xs text-rose-600">{err('imei')}</span>
                ) : null}
              </FormSection>
            ) : null}

            {step === 2 ? (
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
                                ? 'border-brand-500 bg-brand-600/10 text-brand-700 ring-2 ring-brand-600/20'
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
                                ? 'border-brand-500 bg-brand-600/10 font-medium text-brand-700'
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

            {step === 3 ? (
              <>
                <FormSection icon={CheckCircle2} title="Review" description="Check everything with the customer before creating the sale.">
                  <dl className="space-y-3 text-sm">
                    {customer ? (
                      <ReviewRow
                        title="Customer"
                        lines={[
                          customer.fullName,
                          customer.phone,
                          `${ID_TYPES.find((t) => t.value === customer.idDocumentType)?.label} · ${customer.nationalId}`,
                          customer.address ?? '',
                        ]}
                      />
                    ) : null}
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
                    <li>Guardians on file may be contacted if payments are missed.</li>
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
              <p className="flex items-start gap-2 rounded-xl bg-rose-500/10 px-4 py-3 text-sm text-rose-600 dark:text-rose-400">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                {saleErrorMessage(createSale.error)}
              </p>
            ) : null}
          </div>

        </form>
      </Modal>
    </div>
  );
}

/** Slim 5-segment progress with labels — replaces the numbered-circle stepper. */
function StepBar({ step }: { step: number }) {
  return (
    <ol className="grid grid-cols-5 gap-1.5" aria-label="Progress">
      {STEPS.map((s, i) => (
        <li key={s.label} aria-current={i === step ? 'step' : undefined}>
          <span
            className={cn(
              'block h-1 rounded-full transition-colors',
              i <= step ? 'bg-brand-600' : 'bg-line',
            )}
          />
          <span
            className={cn(
              'mt-1.5 hidden text-[11px] sm:block',
              i === step ? 'font-medium text-ink' : i < step ? 'text-muted' : 'text-faint',
            )}
          >
            {s.label}
          </span>
        </li>
      ))}
    </ol>
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

