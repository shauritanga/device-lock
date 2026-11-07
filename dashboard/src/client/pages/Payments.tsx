import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Smartphone } from '@/shared/icons';
import { api } from '@/shared/api/client';
import type { Loan, Payment } from '@/shared/api/types';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Table, Row } from '@/shared/components/ui/Table';
import { StatusDot } from '@/shared/components/ui/Pill';
import { Center, EmptyState, Spinner } from '@/shared/components/ui/misc';
import { Modal } from '@/shared/components/ui/Modal';
import { Field, Input, Select } from '@/shared/components/ui/Field';
import { ListToolbar } from '@/shared/components/ListToolbar';
import { FigureStrip } from '@/shared/components/FigureStrip';
import { PanelEmpty } from '@/shared/components/Panel';
import { money, shortDate } from '@/shared/lib/format';

const METHOD_LABEL: Record<string, string> = {
  MPESA: 'M-Pesa',
  TIGOPESA: 'Mixx by Yas',
  AIRTELMONEY: 'Airtel Money',
  CARD: 'Card',
  BANK: 'Bank',
  CASH: 'Cash',
};

const STATUS_FILTERS = [
  { value: 'ALL', label: 'All statuses' },
  { value: 'CONFIRMED', label: 'Confirmed' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'REVERSED', label: 'Reversed' },
];

export default function Payments() {
  const qc = useQueryClient();
  const [mode, setMode] = useState<null | 'cash' | 'mobile'>(null);
  const [form, setForm] = useState({ loanId: '', amount: '', phoneNumber: '' });
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('ALL');

  const { data, isLoading } = useQuery({
    queryKey: ['payments'],
    queryFn: async () => (await api.get<Payment[]>('/payments')).data,
  });
  const { data: loans } = useQuery({
    queryKey: ['loans'],
    queryFn: async () => (await api.get<Loan[]>('/loans')).data,
  });

  const loanById = useMemo(() => new Map((loans ?? []).map((l) => [l.id, l])), [loans]);

  const close = () => {
    setMode(null);
    setForm({ loanId: '', amount: '', phoneNumber: '' });
  };
  const done = () => {
    close();
    qc.invalidateQueries({ queryKey: ['payments'] });
  };

  const cash = useMutation({
    mutationFn: async () =>
      (await api.post('/payments', { loanId: form.loanId, amount: Number(form.amount), method: 'CASH' })).data,
    onSuccess: done,
  });
  const mobile = useMutation({
    mutationFn: async () =>
      (
        await api.post('/payments/mobile', {
          loanId: form.loanId,
          amount: Number(form.amount),
          phoneNumber: form.phoneNumber,
        })
      ).data,
    onSuccess: done,
  });

  const figures = useMemo(() => {
    const all = data ?? [];
    const now = new Date();
    const confirmed = all.filter((p) => p.status === 'CONFIRMED');
    const sum = (rows: Payment[]) => rows.reduce((t, p) => t + Number(p.amount), 0);
    const thisMonth = confirmed.filter((p) => {
      const d = new Date(p.receivedAt);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    });
    const pending = all.filter((p) => p.status === 'PENDING');
    return { total: sum(confirmed), month: sum(thisMonth), pending, count: confirmed.length };
  }, [data]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data ?? []).filter((p) => {
      if (status !== 'ALL' && p.status !== status) return false;
      if (!q) return true;
      const loan = loanById.get(p.loanId);
      return [loan?.customer?.fullName, loan?.device?.imei, p.orderReference, METHOD_LABEL[p.method] ?? p.method]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [data, loanById, query, status]);

  if (isLoading) return <Center><Spinner /></Center>;

  const activeLoans = (loans ?? []).filter((l) => l.status === 'ACTIVE');
  const busy = cash.isPending || mobile.isPending;
  const failed = cash.isError || mobile.isError;
  const formId = 'payment-form';

  return (
    <div className="space-y-5">
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={() => setMode('mobile')}>
          <Smartphone className="h-4 w-4" /> Mobile money
        </Button>
        <Button onClick={() => setMode('cash')}>
          <Plus className="h-4 w-4" /> Record cash
        </Button>
      </div>

      <FigureStrip
        items={[
          { label: 'Collected this month', value: money(figures.month) },
          { label: 'Collected all time', value: money(figures.total) },
          { label: 'Confirmed payments', value: figures.count },
          {
            label: 'Awaiting customer',
            value: figures.pending.length,
            hint: figures.pending.length ? money(figures.pending.reduce((t, p) => t + Number(p.amount), 0)) : undefined,
          },
        ]}
      />

      <Card>
        <ListToolbar
          title="Payment history"
          noun="payment"
          count={rows.length}
          query={query}
          onQuery={setQuery}
          placeholder="Search customer, IMEI, reference"
          filter={{ value: status, onChange: setStatus, options: STATUS_FILTERS }}
        />

        {!data || data.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title="No payments yet"
              hint="Record a cash payment or send a mobile-money request to a customer."
            />
          </div>
        ) : rows.length === 0 ? (
          <PanelEmpty>No payments match your search.</PanelEmpty>
        ) : (
          <Table columns={['Customer', 'Method', 'Status', 'Reference', 'Date', 'Amount']}>
            {rows.map((p) => {
              const loan = loanById.get(p.loanId);
              return (
                <Row key={p.id}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-ink">{loan?.customer?.fullName ?? '—'}</p>
                    {loan?.device?.imei ? (
                      <p className="font-mono text-xs text-faint">{loan.device.imei}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-muted">{METHOD_LABEL[p.method] ?? p.method}</td>
                  <td className="px-4 py-3"><StatusDot status={p.status} /></td>
                  <td className="px-4 py-3 font-mono text-xs text-muted">{p.orderReference ?? '—'}</td>
                  <td className="px-4 py-3 text-muted">{shortDate(p.receivedAt)}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums text-ink">{money(p.amount)}</td>
                </Row>
              );
            })}
          </Table>
        )}
      </Card>

      <Modal
        open={mode !== null}
        onClose={close}
        title={mode === 'mobile' ? 'Request mobile-money payment' : 'Record cash payment'}
        subtitle={
          mode === 'mobile'
            ? 'The customer gets a payment prompt on their phone.'
            : 'Money you received in person.'
        }
        dirty={Boolean(form.loanId || form.amount || form.phoneNumber)}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" form={formId} disabled={busy}>
              {mode === 'mobile' ? 'Send payment request' : 'Record payment'}
            </Button>
          </>
        }
      >
        <form
          id={formId}
          onSubmit={(e) => {
            e.preventDefault();
            mode === 'mobile' ? mobile.mutate() : cash.mutate();
          }}
          className="space-y-4"
        >
          <Field label="Loan">
            <Select value={form.loanId} onChange={(e) => setForm({ ...form, loanId: e.target.value })} required>
              <option value="">Select a customer's loan</option>
              {activeLoans.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.customer?.fullName} · {l.device?.imei}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Amount (TZS)">
            <Input
              type="number"
              min={1}
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              required
            />
          </Field>
          {mode === 'mobile' && (
            <Field label="Customer phone" hint="Format 255712345678">
              <Input
                value={form.phoneNumber}
                onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })}
                placeholder="255712345678"
                required
              />
            </Field>
          )}
          {failed && <p className="text-sm text-rose-600">Could not process the payment. Check the details and try again.</p>}
        </form>
      </Modal>
    </div>
  );
}
