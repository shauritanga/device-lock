import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { api } from '@/shared/api/client';
import type { Customer } from '@/shared/api/types';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Table, Row } from '@/shared/components/ui/Table';
import { Avatar, Center, EmptyState, Spinner } from '@/shared/components/ui/misc';
import { Modal } from '@/shared/components/ui/Modal';
import { Field, Input, Select } from '@/shared/components/ui/Field';
import { shortDate } from '@/shared/lib/format';

const ID_TYPES = [
  { value: 'NATIONAL_ID', label: 'National ID' },
  { value: 'VOTER_ID', label: 'Voter ID' },
  { value: 'DRIVING_LICENSE', label: 'Driving licence' },
] as const;

function idTypeLabel(type?: string | null) {
  return ID_TYPES.find((t) => t.value === type)?.label ?? 'ID';
}

export default function Customers() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    fullName: '',
    phone: '',
    nationalId: '',
    idDocumentType: 'NATIONAL_ID' as (typeof ID_TYPES)[number]['value'],
  });

  const { data, isLoading } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => (await api.get<Customer[]>('/customers')).data,
  });

  const create = useMutation({
    mutationFn: async () => (await api.post('/customers', form)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      setOpen(false);
      setForm({
        fullName: '',
        phone: '',
        nationalId: '',
        idDocumentType: 'NATIONAL_ID',
      });
    },
  });

  if (isLoading) {
    return (
      <Center>
        <Spinner />
      </Center>
    );
  }

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
          <Table columns={['Customer', 'Phone', 'Person ID', 'Joined']}>
            {data.map((c) => (
              <Row key={c.id}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={c.fullName} />
                    <span className="font-medium">{c.fullName}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-muted">{c.phone}</td>
                <td className="px-4 py-3 text-muted">
                  {c.nationalId
                    ? `${idTypeLabel(c.idDocumentType)} · ${c.nationalId}`
                    : '—'}
                </td>
                <td className="px-4 py-3 text-right text-muted">
                  {shortDate(c.createdAt)}
                </td>
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
          <Field label="ID type">
            <Select
              value={form.idDocumentType}
              onChange={(e) =>
                setForm({
                  ...form,
                  idDocumentType: e.target
                    .value as (typeof ID_TYPES)[number]['value'],
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
              onChange={(e) => setForm({ ...form, nationalId: e.target.value })}
              required
              minLength={4}
            />
          </Field>
          {create.isError ? (
            <p className="text-sm text-rose-600">Could not create customer.</p>
          ) : null}
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
