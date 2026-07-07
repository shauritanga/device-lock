import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { api } from '../api/client';
import type { Customer, Device } from '../api/types';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Table, Row } from '../components/ui/Table';
import { StatusPill } from '../components/ui/Pill';
import { Center, EmptyState, Spinner } from '../components/ui/misc';
import { Modal } from '../components/ui/Modal';
import { Field, Input, Select } from '../components/ui/Field';
import { shortDate } from '../lib/format';

export default function Devices() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ imei: '', make: '', model: '', customerId: '' });

  const { data, isLoading } = useQuery({
    queryKey: ['devices'],
    queryFn: async () => (await api.get<Device[]>('/devices')).data,
  });
  const { data: customers } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => (await api.get<Customer[]>('/customers')).data,
  });

  const create = useMutation({
    mutationFn: async () => {
      const payload: Record<string, string> = { imei: form.imei };
      if (form.make) payload.make = form.make;
      if (form.model) payload.model = form.model;
      if (form.customerId) payload.customerId = form.customerId;
      return (await api.post('/devices', payload)).data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['devices'] });
      setOpen(false);
      setForm({ imei: '', make: '', model: '', customerId: '' });
    },
  });

  if (isLoading) return <Center><Spinner /></Center>;

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> Register device
        </Button>
      </div>

      <Card className="p-3">
        {!data || data.length === 0 ? (
          <EmptyState title="No devices yet" hint="Register a device to issue an enrollment QR." />
        ) : (
          <Table columns={['IMEI', 'Model', 'Status', 'Last check-in', 'Registered']}>
            {data.map((d) => (
              <Row key={d.id} onClick={() => navigate(`/devices/${d.id}`)}>
                <td className="px-4 py-3 font-medium">{d.imei}</td>
                <td className="px-4 py-3 text-muted">
                  {[d.make, d.model].filter(Boolean).join(' ') || '—'}
                </td>
                <td className="px-4 py-3"><StatusPill status={d.status} /></td>
                <td className="px-4 py-3 text-muted">{shortDate(d.lastCheckInAt)}</td>
                <td className="px-4 py-3 text-right text-muted">{shortDate(d.createdAt)}</td>
              </Row>
            ))}
          </Table>
        )}
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="Register device">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
          className="space-y-4"
        >
          <Field label="IMEI">
            <Input
              value={form.imei}
              onChange={(e) => setForm({ ...form, imei: e.target.value })}
              required
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Make">
              <Input value={form.make} onChange={(e) => setForm({ ...form, make: e.target.value })} />
            </Field>
            <Field label="Model">
              <Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
            </Field>
          </div>
          <Field label="Customer (optional)">
            <Select
              value={form.customerId}
              onChange={(e) => setForm({ ...form, customerId: e.target.value })}
            >
              <option value="">— None —</option>
              {customers?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.fullName} · {c.phone}
                </option>
              ))}
            </Select>
          </Field>
          {create.isError && <p className="text-sm text-rose-600">Could not register device.</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Saving…' : 'Register'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
