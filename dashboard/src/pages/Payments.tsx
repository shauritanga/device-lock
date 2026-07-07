import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Smartphone } from 'lucide-react';
import { api } from '../api/client';
import type { Loan, Payment } from '../api/types';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Table, Row } from '../components/ui/Table';
import { StatusPill } from '../components/ui/Pill';
import { Center, EmptyState, Spinner } from '../components/ui/misc';
import { Modal } from '../components/ui/Modal';
import { Field, Input, Select } from '../components/ui/Field';
import { money, shortDate } from '../lib/format';

export default function Payments() {
  const qc = useQueryClient();
  const [mode, setMode] = useState<null | 'cash' | 'mobile'>(null);
  const [form, setForm] = useState({ loanId: '', amount: '', phoneNumber: '' });

  const { data, isLoading } = useQuery({
    queryKey: ['payments'],
    queryFn: async () => (await api.get<Payment[]>('/payments')).data,
  });
  const { data: loans } = useQuery({
    queryKey: ['loans'],
    queryFn: async () => (await api.get<Loan[]>('/loans')).data,
  });

  const reset = () => {
    setMode(null);
    setForm({ loanId: '', amount: '', phoneNumber: '' });
    qc.invalidateQueries({ queryKey: ['payments'] });
  };

  const cash = useMutation({
    mutationFn: async () =>
      (await api.post('/payments', { loanId: form.loanId, amount: Number(form.amount), method: 'CASH' })).data,
    onSuccess: reset,
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
    onSuccess: reset,
  });

  if (isLoading) return <Center><Spinner /></Center>;

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

      <Card className="p-3">
        {!data || data.length === 0 ? (
          <EmptyState title="No payments yet" />
        ) : (
          <Table columns={['Method', 'Status', 'Reference', 'Date', 'Amount']}>
            {data.map((p) => (
              <Row key={p.id}>
                <td className="px-4 py-3 font-medium">{p.method}</td>
                <td className="px-4 py-3"><StatusPill status={p.status} /></td>
                <td className="px-4 py-3 font-mono text-xs text-muted">{p.orderReference ?? '—'}</td>
                <td className="px-4 py-3 text-muted">{shortDate(p.receivedAt)}</td>
                <td className="px-4 py-3 text-right font-semibold">{money(p.amount)}</td>
              </Row>
            ))}
          </Table>
        )}
      </Card>

      <Modal
        open={mode !== null}
        onClose={() => setMode(null)}
        title={mode === 'mobile' ? 'Initiate mobile-money payment' : 'Record cash payment'}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mode === 'mobile' ? mobile.mutate() : cash.mutate();
          }}
          className="space-y-4"
        >
          <Field label="Loan">
            <Select
              value={form.loanId}
              onChange={(e) => setForm({ ...form, loanId: e.target.value })}
              required
            >
              <option value="">— Select —</option>
              {loans
                ?.filter((l) => l.status === 'ACTIVE')
                .map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.customer?.fullName} · {l.device?.imei}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Amount (TZS)">
            <Input
              type="number"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              required
            />
          </Field>
          {mode === 'mobile' && (
            <Field label="Payer phone (2557…)">
              <Input
                value={form.phoneNumber}
                onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })}
                placeholder="255712345678"
                required
              />
            </Field>
          )}
          {(cash.isError || mobile.isError) && (
            <p className="text-sm text-rose-600">Could not process payment.</p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setMode(null)}>
              Cancel
            </Button>
            <Button type="submit" disabled={cash.isPending || mobile.isPending}>
              {mode === 'mobile' ? 'Send USSD push' : 'Record payment'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
