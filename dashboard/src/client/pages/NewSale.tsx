import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  Copy,
  CreditCard,
  Plus,
  QrCode,
  Smartphone,
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
import { money, shortDate } from '@/shared/lib/format';

type IdDocumentType = 'NATIONAL_ID' | 'VOTER_ID' | 'DRIVING_LICENSE';

type SaleResult = {
  customer: Customer;
  device: Device & { enrollmentToken?: string };
  loan: Loan;
};

const ID_TYPES: Array<{ value: IdDocumentType; label: string; hint: string }> = [
  { value: 'NATIONAL_ID', label: 'National ID', hint: 'NIDA / citizenship ID' },
  { value: 'VOTER_ID', label: 'Voter ID', hint: 'Voters’ card number' },
  { value: 'DRIVING_LICENSE', label: 'Driving licence', hint: 'Licence number' },
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
  termMonths: '6',
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
    `Term: ${form.termMonths} month(s)`,
    'The customer agrees to pay installments on time.',
    'The customer understands that reminders will be sent before restriction.',
    'If payments are missed after the grace period, the phone may be restricted until payment is confirmed.',
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
  const monthly =
    totalRepayable / Math.max(Number(form.termMonths) || 1, 1);

  const idPlaceholder = useMemo(() => {
    switch (form.idDocumentType) {
      case 'VOTER_ID':
        return 'e.g. T-1234-5678-9012';
      case 'DRIVING_LICENSE':
        return 'e.g. 4001234567';
      default:
        return 'e.g. 19850615-12345-00001-23';
    }
  }, [form.idDocumentType]);

  const createSale = useMutation({
    mutationFn: async () => {
      const phone = form.phone.trim();
      const nationalId = form.nationalId.trim();
      if (!nationalId) throw new Error('Person ID is required');

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
            ...(form.address.trim() ? { address: form.address.trim() } : {}),
          })
        ).data;
      } else {
        customer = (
          await api.post<Customer>('/customers', {
            fullName: form.fullName.trim(),
            phone,
            nationalId,
            idDocumentType: form.idDocumentType,
            ...(form.address.trim() ? { address: form.address.trim() } : {}),
          })
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
          termMonths: Number(form.termMonths),
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
          termMonths: Number(form.termMonths),
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
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="hidden text-xl font-bold tracking-tight md:block">Sales</h2>
          <p className="text-sm text-muted">
            Start a credit sale here — customer, phone, loan, and contract in one
            step. Use Devices afterward for enrollment QR, lock, and status.
          </p>
        </div>
        <Button
          onClick={() => {
            createSale.reset();
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
                {result.loan.termMonths} months · starts{' '}
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
                <td className="px-4 py-3 text-muted">{sale.termMonths} mo</td>
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
            createSale.mutate();
          }}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
            {/* Customer */}
            <section className="rounded-2xl border border-line bg-canvas/40 p-4 sm:p-5">
              <SectionTitle
                icon={UserRound}
                title="Customer"
                subtitle="Who is buying on credit"
              />
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Field label="Full name">
                  <Input
                    value={form.fullName}
                    onChange={(e) =>
                      setForm({ ...form, fullName: e.target.value })
                    }
                    placeholder="Asha Mwakalinga"
                    required
                  />
                </Field>
                <Field label="Phone / mobile money">
                  <Input
                    value={form.phone}
                    onChange={(e) =>
                      setForm({ ...form, phone: e.target.value })
                    }
                    placeholder="+255 7XX XXX XXX"
                    inputMode="tel"
                    required
                  />
                </Field>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Field label="Person ID type">
                  <Select
                    value={form.idDocumentType}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        idDocumentType: e.target.value as IdDocumentType,
                      })
                    }
                    required
                  >
                    {ID_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="ID number">
                  <Input
                    value={form.nationalId}
                    onChange={(e) =>
                      setForm({ ...form, nationalId: e.target.value })
                    }
                    placeholder={idPlaceholder}
                    required
                    minLength={4}
                  />
                </Field>
              </div>

              <div className="mt-3">
                <Field label="Address (optional)">
                  <Input
                    value={form.address}
                    onChange={(e) =>
                      setForm({ ...form, address: e.target.value })
                    }
                    placeholder="Street, ward, city"
                  />
                </Field>
              </div>
            </section>

            {/* Device */}
            <section className="rounded-2xl border border-line bg-canvas/40 p-4 sm:p-5">
              <SectionTitle
                icon={Smartphone}
                title="Device"
                subtitle="Phone being financed"
              />
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Field label="IMEI / device ID">
                    <Input
                      value={form.imei}
                      onChange={(e) =>
                        setForm({ ...form, imei: e.target.value })
                      }
                      placeholder="15-digit IMEI"
                      required
                    />
                  </Field>
                </div>
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
                    onChange={(e) =>
                      setForm({ ...form, model: e.target.value })
                    }
                    placeholder="Spark 20"
                  />
                </Field>
              </div>
            </section>

            {/* Plan */}
            <section className="rounded-2xl border border-line bg-canvas/40 p-4 sm:p-5">
              <SectionTitle
                icon={CreditCard}
                title="Repayment plan"
                subtitle="Price, deposit, and term"
              />
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Field label="Phone price (TZS)">
                  <Input
                    type="number"
                    min="1"
                    value={form.principal}
                    onChange={(e) =>
                      setForm({ ...form, principal: e.target.value })
                    }
                    required
                  />
                </Field>
                <Field label="Deposit (TZS)">
                  <Input
                    type="number"
                    min="0"
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
                    value={form.interestRate}
                    onChange={(e) =>
                      setForm({ ...form, interestRate: e.target.value })
                    }
                  />
                </Field>
                <Field label="Term (months)">
                  <Select
                    value={form.termMonths}
                    onChange={(e) =>
                      setForm({ ...form, termMonths: e.target.value })
                    }
                    required
                  >
                    {[3, 4, 5, 6, 9, 12].map((m) => (
                      <option key={m} value={String(m)}>
                        {m} months
                      </option>
                    ))}
                  </Select>
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Start date">
                    <Input
                      type="date"
                      value={form.startDate}
                      onChange={(e) =>
                        setForm({ ...form, startDate: e.target.value })
                      }
                      required
                    />
                  </Field>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl border border-line bg-surface p-3 text-center">
                <SummaryCell label="Financed" value={money(financed)} />
                <SummaryCell
                  label="Total repayable"
                  value={money(totalRepayable)}
                  emphasize
                />
                <SummaryCell label="Est. monthly" value={money(monthly)} />
              </div>
            </section>

            {/* Consent */}
            <section className="rounded-2xl border border-line p-4 sm:p-5">
              <p className="text-sm font-semibold text-ink">
                Consent & fair-use terms
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
                <li>Installment plan and total repayable are clear before handover.</li>
                <li>Reminders are sent before any restriction.</li>
                <li>
                  After missed payment and grace, the phone may be restricted until
                  payment is confirmed.
                </li>
                <li>Emergency access remains; personal data is not deleted.</li>
                <li>After final settlement, the phone is permanently released.</li>
              </ul>
              <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl bg-canvas px-3 py-3 text-sm text-ink">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-line accent-brand-600"
                  checked={form.consentAccepted}
                  onChange={(e) =>
                    setForm({ ...form, consentAccepted: e.target.checked })
                  }
                  required
                />
                <span>
                  I confirm the customer accepted these SimuLinda credit-sale
                  terms.
                </span>
              </label>
            </section>

            {createSale.isError ? (
              <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {saleErrorMessage(createSale.error)}
              </p>
            ) : null}
          </div>

          <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-line bg-surface px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setForm(initialForm);
                createSale.reset();
              }}
              disabled={createSale.isPending}
            >
              Reset
            </Button>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button
                type="button"
                variant="secondary"
                onClick={closeModal}
                disabled={createSale.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  createSale.isPending ||
                  !form.consentAccepted ||
                  !form.nationalId.trim()
                }
              >
                {createSale.isPending
                  ? 'Creating sale…'
                  : 'Create sale & enrollment token'}
              </Button>
            </div>
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
