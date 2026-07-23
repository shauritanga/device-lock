import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Copy, Plus, QrCode } from 'lucide-react';
import axios from 'axios';
import { api } from '@/shared/api/client';
import type { Customer, Device, Loan } from '@/shared/api/types';
import { Button } from '@/shared/components/ui/Button';
import { Card, CardHeader } from '@/shared/components/ui/Card';
import { Field, Input } from '@/shared/components/ui/Field';
import { Modal } from '@/shared/components/ui/Modal';
import { StatusPill } from '@/shared/components/ui/Pill';
import { Row, Table } from '@/shared/components/ui/Table';
import { Center, EmptyState, Spinner } from '@/shared/components/ui/misc';
import { money, shortDate } from '@/shared/lib/format';

type SaleResult = {
  customer: Customer;
  device: Device & { enrollmentToken?: string };
  loan: Loan;
};

const initialForm = {
  fullName: '',
  phone: '',
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
  return [
    'SimuLinda Credit Sale Agreement',
    `Customer: ${form.fullName}`,
    `Phone: ${[form.make, form.model].filter(Boolean).join(' ') || form.imei}`,
    `Device ID/IMEI: ${form.imei}`,
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

  const totalRepayable = (() => {
    const principal = Number(form.principal) || 0;
    const downPayment = Number(form.downPayment) || 0;
    const interestRate = Number(form.interestRate) || 0;
    const financed = Math.max(principal - downPayment, 0);
    return financed + financed * (interestRate / 100);
  })();

  const createSale = useMutation({
    mutationFn: async () => {
      const phone = form.phone.trim();
      const existingCustomers = (await api.get<Customer[]>('/customers')).data;
      const customer = existingCustomers.find((c) => normalizePhone(c.phone) === normalizePhone(phone)) ?? (
        await api.post<Customer>('/customers', {
          fullName: form.fullName.trim(),
          phone,
          ...(form.nationalId.trim() ? { nationalId: form.nationalId.trim() } : {}),
          ...(form.address.trim() ? { address: form.address.trim() } : {}),
        })
      ).data;

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
          principal: Number(form.principal),
          downPayment: form.downPayment ? Number(form.downPayment) : 0,
          interestRate: form.interestRate ? Number(form.interestRate) : 0,
          termMonths: Number(form.termMonths),
        },
      });

      return {
        customer,
        device: { ...registered.device, enrollmentToken: registered.enrollmentToken },
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

  if (isLoading) return <Center><Spinner /></Center>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Sales</h2>
          <p className="text-sm text-muted">Credit sales, customer assignments, devices, and repayment status.</p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> Add new sale
        </Button>
      </div>

      {result ? (
        <Card className="p-6">
          <CardHeader
            title={<span className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-emerald-600" /> Sale ready for enrollment</span>}
            subtitle="Use this token or the device QR page to enroll the phone as the controlled SimuLinda app."
          />
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <div className="rounded-xl bg-canvas p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Customer</p>
              <p className="mt-1 font-semibold">{result.customer.fullName}</p>
              <p className="text-sm text-muted">{result.customer.phone}</p>
            </div>
            <div className="rounded-xl bg-canvas p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Loan</p>
              <p className="mt-1 font-semibold">{money(result.loan.principal, result.loan.currency)}</p>
              <p className="text-sm text-muted">{result.loan.termMonths} months · starts {shortDate(result.loan.startDate)}</p>
            </div>
            <div className="rounded-xl bg-canvas p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Device</p>
              <p className="mt-1 font-semibold">{result.device.imei}</p>
              <p className="text-sm text-muted">{[result.device.make, result.device.model].filter(Boolean).join(' ') || 'Model not set'}</p>
            </div>
          </div>
          <div className="mt-4 rounded-xl border border-dashed border-brand-300 bg-brand-50 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="flex items-center gap-2 text-sm font-semibold text-brand-800">
                  <QrCode className="h-4 w-4" /> Enrollment token
                </p>
                <code className="mt-2 block break-all rounded-lg bg-white px-3 py-2 text-sm text-ink">
                  {result.device.enrollmentToken}
                </code>
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={() => navigator.clipboard.writeText(result.device.enrollmentToken ?? '')}
              >
                <Copy className="h-4 w-4" /> Copy
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      <Card className="p-3">
        {!sales || sales.length === 0 ? (
          <EmptyState title="No sales yet" hint="Add your first credit sale to register a customer, device, and repayment plan." />
        ) : (
          <Table columns={['Customer', 'Device', 'Amount', 'Term', 'Contract', 'Status', 'Started']}>
            {sales.map((sale) => (
              <Row key={sale.id} onClick={() => navigate(`/loans/${sale.id}`)}>
                <td className="px-4 py-3 font-medium">{sale.customer?.fullName ?? '—'}</td>
                <td className="px-4 py-3 text-muted">
                  {sale.device?.imei ?? '—'} {sale.device?.model ? `· ${sale.device.model}` : ''}
                </td>
                <td className="px-4 py-3">{money(sale.principal, sale.currency)}</td>
                <td className="px-4 py-3 text-muted">{sale.termMonths} mo</td>
                <td className="px-4 py-3">
                  <StatusPill status={sale.contract ? 'SIGNED' : 'MISSING'} />
                </td>
                <td className="px-4 py-3"><StatusPill status={sale.status} /></td>
                <td className="px-4 py-3 text-right text-muted">{shortDate(sale.startDate)}</td>
              </Row>
            ))}
          </Table>
        )}
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="Add new sale" className="max-h-[92vh] max-w-none w-[min(96vw,72rem)] overflow-y-auto">

        <form
          onSubmit={(e) => {
            e.preventDefault();
            createSale.mutate();
          }}
          className="space-y-6"
        >
          <section className="space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">1. Customer</h3>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="xl:col-span-2">
                <Field label="Full name">
                  <Input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required />
                </Field>
              </div>
              <div className="xl:col-span-2">
                <Field label="Phone / mobile money number">
                  <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="0692 251 043" required />
                </Field>
              </div>
              <div className="xl:col-span-2">
                <Field label="National ID (optional)">
                  <Input value={form.nationalId} onChange={(e) => setForm({ ...form, nationalId: e.target.value })} />
                </Field>
              </div>
              <div className="xl:col-span-2">
                <Field label="Address (optional)">
                  <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
                </Field>
              </div>
            </div>
          </section>

          <section className="space-y-4 border-t border-line pt-6">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">2. Device</h3>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="xl:col-span-2">
                <Field label="IMEI / device ID">
                  <Input value={form.imei} onChange={(e) => setForm({ ...form, imei: e.target.value })} required />
                </Field>
              </div>
              <Field label="Make">
                <Input value={form.make} onChange={(e) => setForm({ ...form, make: e.target.value })} placeholder="Tecno" />
              </Field>
              <Field label="Model">
                <Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder="Spark 20" />
              </Field>
            </div>
          </section>

          <section className="space-y-4 border-t border-line pt-6">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">3. Repayment plan</h3>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-12">
              <div className="xl:col-span-3">
                <Field label="Phone price (TZS)">
                  <Input type="number" min="1" value={form.principal} onChange={(e) => setForm({ ...form, principal: e.target.value })} required />
                </Field>
              </div>
              <div className="xl:col-span-3">
                <Field label="Deposit">
                  <Input type="number" min="0" value={form.downPayment} onChange={(e) => setForm({ ...form, downPayment: e.target.value })} />
                </Field>
              </div>
              <div className="xl:col-span-2">
                <Field label="Flat interest (%)">
                  <Input type="number" min="0" value={form.interestRate} onChange={(e) => setForm({ ...form, interestRate: e.target.value })} />
                </Field>
              </div>
              <div className="xl:col-span-2">
                <Field label="Term (months)">
                  <Input type="number" min="1" value={form.termMonths} onChange={(e) => setForm({ ...form, termMonths: e.target.value })} required />
                </Field>
              </div>
              <div className="md:col-span-2 xl:col-span-2">
                <Field label="Start date">
                  <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} required />
                </Field>
              </div>
            </div>
          </section>

          <div className="grid gap-3 rounded-xl bg-canvas p-4 text-sm md:grid-cols-3">
            <div>
              <p className="text-muted">Financed amount</p>
              <p className="font-semibold">{money(Math.max((Number(form.principal) || 0) - (Number(form.downPayment) || 0), 0))}</p>
            </div>
            <div>
              <p className="text-muted">Total repayable</p>
              <p className="font-semibold">{money(totalRepayable)}</p>
            </div>
            <div>
              <p className="text-muted">Estimated monthly</p>
              <p className="font-semibold">{money(totalRepayable / Math.max(Number(form.termMonths) || 1, 1))}</p>
            </div>
          </div>

          <section className="space-y-3 border-t border-line pt-6">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">4. Consent and fair-use terms</h3>
            <div className="rounded-xl border border-line bg-canvas p-4 text-sm text-muted">
              <p className="font-medium text-ink">Customer must understand and accept:</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>The installment plan and total repayable amount are clear before handover.</li>
                <li>Reminders are sent before any restriction.</li>
                <li>After missed payment and grace period, the phone may be restricted until payment is confirmed.</li>
                <li>Emergency access remains available and personal data is not deleted.</li>
                <li>After final settlement, the phone is permanently released.</li>
              </ul>
              <label className="mt-4 flex items-start gap-2 text-ink">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-line"
                  checked={form.consentAccepted}
                  onChange={(e) => setForm({ ...form, consentAccepted: e.target.checked })}
                  required
                />
                <span>I confirm the customer has accepted the SimuLinda credit-sale and fair-use terms.</span>
              </label>
            </div>
          </section>

          {createSale.isError ? (
            <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {saleErrorMessage(createSale.error)}
            </p>
          ) : null}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={() => setForm(initialForm)} disabled={createSale.isPending}>
              Reset
            </Button>
            <Button type="submit" disabled={createSale.isPending || !form.consentAccepted}>
              {createSale.isPending ? 'Creating sale…' : 'Create sale and enrollment token'}
            </Button>
          </div>
        </form>
      </Modal>
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
  return 'Could not create sale. Check the customer, device, loan, and contract details, then try again.';
}
