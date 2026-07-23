import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UserPlus } from 'lucide-react';
import { api } from '@/shared/api/client';
import { useAuth } from '@/shared/auth/AuthContext';
import { PLATFORM_ADMIN_ROLES } from '@/shared/auth/roles';
import { Card, CardHeader } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Pill } from '@/shared/components/ui/Pill';
import { EmptyState } from '@/shared/components/ui/misc';
import { Field, Input, Select } from '@/shared/components/ui/Field';

type Collector = {
  id: string;
  fullName: string;
  email: string;
  role: string;
  phone?: string | null;
  isActive: boolean;
  _count?: { assignedCollectionCases: number };
};

/**
 * Platform staffing: who the collectors are, and the BYOD phone number each one
 * uses for system-initiated calls and SMS.
 */
export default function Collectors() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const isPlatformAdmin = user ? PLATFORM_ADMIN_ROLES.includes(user.role) : false;

  const [phone, setPhone] = useState('');
  const [newStaff, setNewStaff] = useState({
    email: '',
    password: '',
    fullName: '',
    role: 'COLLECTOR',
    phone: '',
  });

  const collectors = useQuery({
    queryKey: ['collections', 'collectors'],
    queryFn: async () => (await api.get<Collector[]>('/collections/collectors')).data,
    enabled: isPlatformAdmin,
  });

  const createStaff = useMutation({
    mutationFn: async () =>
      (
        await api.post('/collections/collectors', {
          ...newStaff,
          phone: newStaff.phone || undefined,
        })
      ).data,
    onSuccess: () => {
      setNewStaff({ email: '', password: '', fullName: '', role: 'COLLECTOR', phone: '' });
      qc.invalidateQueries({ queryKey: ['collections', 'collectors'] });
    },
  });

  const savePhone = useMutation({
    mutationFn: async () => (await api.patch('/collections/me/phone', { phone })).data,
  });

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <p className="text-sm font-medium">Your follow-up phone</p>
        <p className="mt-0.5 text-xs text-muted">
          Used for system-initiated calls and SMS (BYOD). Required before contact can be
          verified against the device log.
        </p>
        <form
          className="mt-3 flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            savePhone.mutate();
          }}
        >
          <Input
            className="max-w-xs"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+2557…"
            required
          />
          <Button type="submit" variant="secondary" disabled={savePhone.isPending}>
            Save phone
          </Button>
          {savePhone.isSuccess ? (
            <span className="self-center text-sm text-emerald-700">Saved</span>
          ) : null}
        </form>
      </Card>

      {isPlatformAdmin ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title="Collectors" subtitle="Platform staff who follow up" />
            <div className="space-y-2 p-5">
              {(collectors.data ?? []).length === 0 ? (
                <EmptyState title="No collectors yet" hint="Create one on the right." />
              ) : (
                collectors.data!.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between rounded-xl bg-canvas px-4 py-3 text-sm"
                  >
                    <div>
                      <p className="font-semibold">{c.fullName}</p>
                      <p className="text-xs text-muted">
                        {c.role} · {c.phone || 'No phone'} · open cases{' '}
                        {c._count?.assignedCollectionCases ?? 0}
                      </p>
                    </div>
                    <Pill tone={c.isActive ? 'green' : 'gray'}>
                      {c.isActive ? 'Active' : 'Off'}
                    </Pill>
                  </div>
                ))
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Add platform staff" subtitle="COLLECTOR or COLLECTIONS_ADMIN" />
            <form
              className="space-y-3 p-5"
              onSubmit={(e) => {
                e.preventDefault();
                createStaff.mutate();
              }}
            >
              <Field label="Full name">
                <Input
                  value={newStaff.fullName}
                  onChange={(e) => setNewStaff({ ...newStaff, fullName: e.target.value })}
                  required
                />
              </Field>
              <Field label="Email">
                <Input
                  type="email"
                  value={newStaff.email}
                  onChange={(e) => setNewStaff({ ...newStaff, email: e.target.value })}
                  required
                />
              </Field>
              <Field label="Password">
                <Input
                  type="password"
                  value={newStaff.password}
                  onChange={(e) => setNewStaff({ ...newStaff, password: e.target.value })}
                  required
                  minLength={8}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Role">
                  <Select
                    value={newStaff.role}
                    onChange={(e) => setNewStaff({ ...newStaff, role: e.target.value })}
                  >
                    <option value="COLLECTOR">COLLECTOR</option>
                    {user?.role === 'SUPER_ADMIN' ? (
                      <option value="COLLECTIONS_ADMIN">COLLECTIONS_ADMIN</option>
                    ) : null}
                  </Select>
                </Field>
                <Field label="Follow-up phone">
                  <Input
                    value={newStaff.phone}
                    onChange={(e) => setNewStaff({ ...newStaff, phone: e.target.value })}
                    placeholder="+255…"
                  />
                </Field>
              </div>
              <Button type="submit" disabled={createStaff.isPending}>
                <UserPlus className="h-4 w-4" />
                {createStaff.isPending ? 'Creating…' : 'Create'}
              </Button>
              {createStaff.isError ? (
                <p className="text-sm text-rose-600">
                  Could not create — that email may already be in use.
                </p>
              ) : null}
            </form>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
