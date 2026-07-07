import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { api } from '../api/client';
import type { Customer } from '../api/types';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Table, Row } from '../components/ui/Table';
import { Avatar, Center, EmptyState, Spinner } from '../components/ui/misc';
import { Modal } from '../components/ui/Modal';
import { Field, Input } from '../components/ui/Field';
import { shortDate } from '../lib/format';

export default function Customers() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ fullName: '', phone: '', nationalId: '' });

  const { data, isLoading } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => (await api.get<Customer[]>('/customers')).data,
  });

  const create = useMutation({
    mutationFn: async () => (await api.post('/customers', form)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      setOpen(false);
      setForm({ fullName: '', phone: '', nationalId: '' });
    },
  });

  if (isLoading) return <Center><Spinner /></Center>;

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> New customer
        </Button>
      </div>

      <Card className="p-3">
        {!data || data.length === 0 ? (
          <EmptyState title="No customers yet" hint="Add your first customer to begin." />
        ) : (
          <Table columns={['Customer', 'Phone', 'National ID', 'Joined']}>
            {data.map((c) => (
              <Row key={c.id}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={c.fullName} />
                    <span className="font-medium">{c.fullName}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-muted">{c.phone}</td>
                <td className="px-4 py-3 text-muted">{c.nationalId || '—'}</td>
                <td className="px-4 py-3 text-right text-muted">{shortDate(c.createdAt)}</td>
              </Row>
            ))}
          </Table>
        )}
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="New customer">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
          className="space-y-4"
        >
          <Field label="Full name">
            <Input
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              required
            />
          </Field>
          <Field label="Phone (mobile money)">
            <Input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="0712 345 678"
              required
            />
          </Field>
          <Field label="National ID (optional)">
            <Input
              value={form.nationalId}
              onChange={(e) => setForm({ ...form, nationalId: e.target.value })}
            />
          </Field>
          {create.isError && <p className="text-sm text-rose-600">Could not create customer.</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Saving…' : 'Create'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
