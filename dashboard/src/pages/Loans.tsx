import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { api } from '../api/client';
import type { Customer, Device, Loan } from '../api/types';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Table, Row } from '../components/ui/Table';
import { StatusPill } from '../components/ui/Pill';
import { Center, EmptyState, Spinner } from '../components/ui/misc';
import { Modal } from '../components/ui/Modal';
import { Field, Input, Select } from '../components/ui/Field';
import { money, shortDate } from '../lib/format';

export default function Loans() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    customerId: '',
    deviceId: '',
    principal: '',
    downPayment: '',
    interestRate: '',
    termMonths: '',
  });

  const { data, isLoading } = useQuery({
    queryKey: ['loans'],
    queryFn: async () => (await api.get<Loan[]>('/loans')).data,
  });
  const { data: customers } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => (await api.get<Customer[]>('/customers')).data,
  });
  const { data: devices } = useQuery({
    queryKey: ['devices'],
    queryFn: async () => (await api.get<Device[]>('/devices')).data,
  });

  const create = useMutation({
    mutationFn: async () =>
      (
        await api.post('/loans', {
          customerId: form.customerId,
          deviceId: form.deviceId,
          principal: Number(form.principal),
          downPayment: form.downPayment ? Number(form.downPayment) : 0,
          interestRate: form.interestRate ? Number(form.interestRate) : 0,
          termMonths: Number(form.termMonths),
        })
      ).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['loans'] });
      setOpen(false);
    },
  });

  if (isLoading) return <Center><Spinner /></Center>;
  const availableDevices = devices?.filter((d) => !d.loan);

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> New loan
        </Button>
      </div>

      <Card className="p-3">
        {!data || data.length === 0 ? (
          <EmptyState title="No loans yet" hint="Create a loan to generate an installment plan." />
        ) : (
          <Table columns={['Customer', 'Device', 'Principal', 'Term', 'Status', 'Started']}>
            {data.map((l) => (
              <Row key={l.id} onClick={() => navigate(`/loans/${l.id}`)}>
                <td className="px-4 py-3 font-medium">{l.customer?.fullName ?? '—'}</td>
                <td className="px-4 py-3 text-muted">{l.device?.imei ?? '—'}</td>
                <td className="px-4 py-3">{money(l.principal, l.currency)}</td>
                <td className="px-4 py-3 text-muted">{l.termMonths} mo</td>
                <td className="px-4 py-3"><StatusPill status={l.status} /></td>
                <td className="px-4 py-3 text-right text-muted">{shortDate(l.startDate)}</td>
              </Row>
            ))}
          </Table>
        )}
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="New loan">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
          className="space-y-4"
        >
          <Field label="Customer">
            <Select
              value={form.customerId}
              onChange={(e) => setForm({ ...form, customerId: e.target.value })}
              required
            >
              <option value="">— Select —</option>
              {customers?.map((c) => (
                <option key={c.id} value={c.id}>{c.fullName}</option>
              ))}
            </Select>
          </Field>
          <Field label="Device">
            <Select
              value={form.deviceId}
              onChange={(e) => setForm({ ...form, deviceId: e.target.value })}
              required
            >
              <option value="">— Select —</option>
              {availableDevices?.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.imei} {d.model ? `· ${d.model}` : ''}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Principal (TZS)">
              <Input
                type="number"
                value={form.principal}
                onChange={(e) => setForm({ ...form, principal: e.target.value })}
                required
              />
            </Field>
            <Field label="Down payment">
              <Input
                type="number"
                value={form.downPayment}
                onChange={(e) => setForm({ ...form, downPayment: e.target.value })}
              />
            </Field>
            <Field label="Flat interest (%)">
              <Input
                type="number"
                value={form.interestRate}
                onChange={(e) => setForm({ ...form, interestRate: e.target.value })}
              />
            </Field>
            <Field label="Term (months)">
              <Input
                type="number"
                value={form.termMonths}
                onChange={(e) => setForm({ ...form, termMonths: e.target.value })}
                required
              />
            </Field>
          </div>
          {create.isError && <p className="text-sm text-rose-600">Could not create loan.</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Creating…' : 'Create loan'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
