import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { api } from '@/shared/api/client';
import type { Installment, Loan } from '@/shared/api/types';
import { Card, CardHeader } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { StatusPill } from '@/shared/components/ui/Pill';
import { Table, Row } from '@/shared/components/ui/Table';
import { Center, Spinner } from '@/shared/components/ui/misc';
import { Modal } from '@/shared/components/ui/Modal';
import { Field, Input, Select } from '@/shared/components/ui/Field';
import { money, shortDate } from '@/shared/lib/format';

const SETTLED = new Set(['PAID', 'WAIVED']);

const outstandingOf = (i: Installment) =>
  Math.max(Number(i.amount) - Number(i.amountPaid), 0);

export default function LoanDetail() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Installment | null>(null);
  const [method, setMethod] = useState('CASH');
  const [amount, setAmount] = useState('');

  const { data: loan, isLoading } = useQuery({
    queryKey: ['loan', id],
    queryFn: async () => (await api.get<Loan>(`/loans/${id}`)).data,
  });

  const pay = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error('No installment selected');
      return (
        await api.post(`/payments/installments/${selected.id}/pay`, {
          method,
          amount: Number(amount),
        })
      ).data;
    },
    onSuccess: () => {
      setSelected(null);
      qc.invalidateQueries({ queryKey: ['loan', id] });
      qc.invalidateQueries({ queryKey: ['loans'] });
      qc.invalidateQueries({ queryKey: ['payments'] });
    },
  });

  if (isLoading || !loan) return <Center><Spinner /></Center>;

  const installments = loan.installments ?? [];
  const paid = installments.filter((i) => i.status === 'PAID').length;
  const total = installments.length;
  const earliestUnpaid = installments
    .filter((i) => !SETTLED.has(i.status))
    .map((i) => i.sequence)
    .sort((a, b) => a - b)[0];
  const loanActive = loan.status === 'ACTIVE';

  const openPay = (i: Installment) => {
    pay.reset();
    setMethod('CASH');
    setAmount(outstandingOf(i).toFixed(2));
    setSelected(i);
  };

  const errorMsg =
    pay.error != null
      ? axios.isAxiosError(pay.error)
        ? String(
            (pay.error.response?.data as { message?: string })?.message ??
              'Could not record payment.',
          )
        : 'Could not record payment.'
      : null;

  return (
    <div className="space-y-6">
      <Link to="/loans" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Back to loans
      </Link>

      <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
        <Metric label="Principal" value={money(loan.principal, loan.currency)} />
        <Metric label="Down payment" value={money(loan.downPayment, loan.currency)} />
        <Metric label="Interest" value={`${loan.interestRate}%`} />
        <Metric label="Progress" value={`${paid}/${total} paid`} />
      </div>

      <Card>
        <CardHeader
          title="Installment schedule"
          subtitle={`${loan.customer?.fullName ?? ''} · ${loan.device?.imei ?? ''}`}
          action={<StatusPill status={loan.status} />}
        />
        <div className="p-3">
          <Table columns={['#', 'Due date', 'Amount', 'Paid', 'Outstanding', 'Status', 'Action']}>
            {installments.map((i) => {
              const settled = SETTLED.has(i.status);
              const blockedByEarlier =
                !settled && loanActive && i.sequence !== earliestUnpaid;
              return (
                <Row key={i.id}>
                  <td className="px-4 py-3 font-medium">{i.sequence}</td>
                  <td className="px-4 py-3 text-muted">{shortDate(i.dueDate)}</td>
                  <td className="px-4 py-3">{money(i.amount, loan.currency)}</td>
                  <td className="px-4 py-3 text-muted">{money(i.amountPaid, loan.currency)}</td>
                  <td className="px-4 py-3 text-muted">
                    {settled ? '—' : money(outstandingOf(i), loan.currency)}
                  </td>
                  <td className="px-4 py-3"><StatusPill status={i.status} /></td>
                  <td className="px-4 py-3 text-right">
                    {!settled && loanActive ? (
                      <Button
                        variant="secondary"
                        className="px-3 py-1.5 text-xs"
                        disabled={blockedByEarlier}
                        title={
                          blockedByEarlier
                            ? `Clear installment #${earliestUnpaid} first — payments apply oldest-first`
                            : `Mark installment #${i.sequence} as paid`
                        }
                        onClick={() => openPay(i)}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" /> Mark paid
                      </Button>
                    ) : (
                      <span className="text-xs text-faint">
                        {settled ? (i.paidAt ? shortDate(i.paidAt) : '—') : ''}
                      </span>
                    )}
                  </td>
                </Row>
              );
            })}
          </Table>
        </div>
      </Card>

      <Modal
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={
          selected
            ? `Mark installment #${selected.sequence} as paid`
            : 'Mark installment as paid'
        }
      >
        {selected && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              pay.mutate();
            }}
            className="space-y-4"
          >
            <p className="text-sm text-muted">
              Records a manual payment of{' '}
              <span className="font-semibold text-ink">
                {money(outstandingOf(selected), loan.currency)}
              </span>{' '}
              outstanding on installment #{selected.sequence} (due{' '}
              {shortDate(selected.dueDate)}). Use this when the customer pays
              cash at the till or otherwise pays outside the mobile-money
              gateway — including paying early, before the due date.
            </p>
            <Field label={`Amount (${loan.currency})`}>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                max={outstandingOf(selected).toFixed(2)}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </Field>
            <Field label="Method">
              <Select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
              >
                <option value="CASH">CASH — till / hand cash</option>
                <option value="BANK">BANK — bank transfer / deposit</option>
                <option value="MPESA">MPESA — verified on phone</option>
                <option value="TIGOPESA">TIGOPESA — verified on phone</option>
                <option value="AIRTELMONEY">AIRTELMONEY — verified on phone</option>
                <option value="CARD">CARD — card payment</option>
              </Select>
            </Field>
            {errorMsg && <p className="text-sm text-rose-600">{errorMsg}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setSelected(null)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pay.isPending}>
                {pay.isPending ? 'Recording…' : 'Record payment'}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-5">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-xl font-bold tracking-tight">{value}</p>
    </Card>
  );
}
