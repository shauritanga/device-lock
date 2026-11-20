import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from '@/shared/icons';
import { api } from '@/shared/api/client';
import { apiErrorMessage } from '@/shared/agreements/apiError';
import type { Agent } from '@/shared/api/types';
import { Button } from '@/shared/components/ui/Button';
import { Card } from '@/shared/components/ui/Card';
import { Field, Input } from '@/shared/components/ui/Field';
import { Modal } from '@/shared/components/ui/Modal';
import { StatusDot } from '@/shared/components/ui/Pill';
import { Table, Row } from '@/shared/components/ui/Table';
import { Avatar, Center, EmptyState, Spinner } from '@/shared/components/ui/misc';
import { FigureStrip } from '@/shared/components/FigureStrip';
import { ListToolbar } from '@/shared/components/ListToolbar';
import { PanelEmpty } from '@/shared/components/Panel';
import { money, shortDate } from '@/shared/lib/format';

const EMPTY = { fullName: '', email: '', phone: '', password: '' };

/**
 * Sales agents sell phones on credit on the owner's behalf. They only see the
 * phones given to them and the sales they made — never device controls.
 */
export default function Agents() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [query, setQuery] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['agents'],
    queryFn: async () => (await api.get<Agent[]>('/agents')).data,
  });

  const create = useMutation({
    mutationFn: async () =>
      (
        await api.post<Agent>('/agents', {
          fullName: form.fullName.trim(),
          email: form.email.trim(),
          password: form.password,
          ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
        })
      ).data,
    onSuccess: (agent) => {
      qc.invalidateQueries({ queryKey: ['agents'] });
      qc.invalidateQueries({ queryKey: ['users'] });
      setOpen(false);
      setForm(EMPTY);
      navigate(`/agents/${agent.id}`);
    },
  });

  const stats = useMemo(() => {
    const all = data ?? [];
    return {
      total: all.filter((a) => a.isActive).length,
      stock: all.reduce((t, a) => t + a.stockCount, 0),
      sales: all.reduce((t, a) => t + a.salesCount, 0),
      financed: all.reduce((t, a) => t + a.totalFinanced, 0),
    };
  }, [data]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data ?? []).filter(
      (a) =>
        !q ||
        [a.fullName, a.email, a.phone].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [data, query]);

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
        <Button
          onClick={() => {
            create.reset();
            setOpen(true);
          }}
        >
          <Plus className="h-4 w-4" /> Add agent
        </Button>
      </div>

      <FigureStrip
        items={[
          { label: 'Active agents', value: stats.total },
          { label: 'Phones with agents', value: stats.stock, hint: 'Not yet sold' },
          { label: 'Sales by agents', value: stats.sales },
          { label: 'Financed by agents', value: money(stats.financed) },
        ]}
      />

      <Card>
        <ListToolbar
          title="Sales agents"
          noun="agent"
          count={rows.length}
          query={query}
          onQuery={setQuery}
          placeholder="Search name, email, phone"
        />
        {!data || data.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title="No agents yet"
              hint="Add an agent, then give them phones from Devices so they can sell on credit for you."
            />
          </div>
        ) : rows.length === 0 ? (
          <PanelEmpty>No agents match your search.</PanelEmpty>
        ) : (
          <Table columns={['Agent', 'Phones held', 'Sales', 'Financed', 'Status', 'Last login']}>
            {rows.map((a) => (
              <Row key={a.id} onClick={() => navigate(`/agents/${a.id}`)}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={a.fullName} />
                    <div>
                      <p className="font-medium text-ink">{a.fullName}</p>
                      <p className="text-xs text-muted">{a.phone || a.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 tabular-nums">{a.stockCount}</td>
                <td className="px-4 py-3 tabular-nums">
                  {a.salesCount}
                  {a.activeSales !== a.salesCount ? (
                    <span className="text-xs text-muted"> · {a.activeSales} active</span>
                  ) : null}
                </td>
                <td className="px-4 py-3 tabular-nums">{money(a.totalFinanced)}</td>
                <td className="px-4 py-3">
                  <StatusDot status={a.isActive ? 'ACTIVE' : 'RELEASED'} label={a.isActive ? 'Active' : 'Disabled'} />
                </td>
                <td className="px-4 py-3 text-right text-muted">{shortDate(a.lastLoginAt)}</td>
              </Row>
            ))}
          </Table>
        )}
      </Card>

      <Modal
        open={open}
        onClose={() => !create.isPending && setOpen(false)}
        title="Add sales agent"
        subtitle="They sign in to this console with the email and password below."
        dirty={!!(form.fullName || form.email || form.password)}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="agent-form" disabled={create.isPending}>
              {create.isPending ? 'Saving…' : 'Add agent'}
            </Button>
          </>
        }
      >
        <form
          id="agent-form"
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <Field label="Full name" required>
            <Input
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              required
              minLength={2}
            />
          </Field>
          <Field label="Email" required>
            <Input
              type="email"
              autoComplete="off"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Phone number">
              <Input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="0712 345 678"
              />
            </Field>
            <Field label="Password" required hint="At least 8 characters.">
              <Input
                type="password"
                autoComplete="new-password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
                minLength={8}
              />
            </Field>
          </div>
          {create.isError ? (
            <p className="text-sm text-rose-600">{apiErrorMessage(create.error, 'Could not add the agent.')}</p>
          ) : null}
        </form>
      </Modal>
    </div>
  );
}
