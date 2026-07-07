import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { api } from '../api/client';
import type { StaffUser } from '../api/types';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Table, Row } from '../components/ui/Table';
import { Pill, StatusPill } from '../components/ui/Pill';
import { Avatar, Center, EmptyState, Spinner } from '../components/ui/misc';
import { Modal } from '../components/ui/Modal';
import { Field, Input, Select } from '../components/ui/Field';
import { shortDate } from '../lib/format';

export default function Staff() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    password: '',
    role: 'AGENT',
  });

  const { data, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: async () => (await api.get<StaffUser[]>('/users')).data,
  });

  const create = useMutation({
    mutationFn: async () => (await api.post('/users', form)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      setOpen(false);
      setForm({ fullName: '', email: '', password: '', role: 'AGENT' });
    },
  });

  if (isLoading) return <Center><Spinner /></Center>;

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> Add staff
        </Button>
      </div>

      <Card className="p-3">
        {!data || data.length === 0 ? (
          <EmptyState title="No staff yet" />
        ) : (
          <Table columns={['Name', 'Email', 'Role', 'Status', 'Last login']}>
            {data.map((u) => (
              <Row key={u.id}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={u.fullName} />
                    <span className="font-medium">{u.fullName}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-muted">{u.email}</td>
                <td className="px-4 py-3"><Pill tone="brand">{u.role}</Pill></td>
                <td className="px-4 py-3">
                  <StatusPill status={u.isActive ? 'ACTIVE' : 'RELEASED'} />
                </td>
                <td className="px-4 py-3 text-right text-muted">{shortDate(u.lastLoginAt)}</td>
              </Row>
            ))}
          </Table>
        )}
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="Add staff member">
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
          <Field label="Email">
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Password">
              <Input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
              />
            </Field>
            <Field label="Role">
              <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="AGENT">Agent</option>
                <option value="MANAGER">Manager</option>
                <option value="OWNER">Owner</option>
              </Select>
            </Field>
          </div>
          {create.isError && <p className="text-sm text-rose-600">Could not add staff member.</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Saving…' : 'Add staff'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
