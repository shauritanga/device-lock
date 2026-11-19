import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Package } from '@/shared/icons';
import { api } from '@/shared/api/client';
import { apiErrorMessage } from '@/shared/agreements/apiError';
import type { AgentDetail as AgentDetailT, Device } from '@/shared/api/types';
import { usePageTrail } from '@/shared/layout/PageTrail';
import { Button } from '@/shared/components/ui/Button';
import { Card, CardHeader } from '@/shared/components/ui/Card';
import { Field, Input } from '@/shared/components/ui/Field';
import { Modal } from '@/shared/components/ui/Modal';
import { StatusDot } from '@/shared/components/ui/Pill';
import { Table, Row } from '@/shared/components/ui/Table';
import { Center, EmptyState, Spinner } from '@/shared/components/ui/misc';
import { FigureStrip } from '@/shared/components/FigureStrip';
import { money, shortDate, termLabel } from '@/shared/lib/format';

export default function AgentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [assignOpen, setAssignOpen] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [pwOpen, setPwOpen] = useState(false);
  const [password, setPassword] = useState('');

  const { data: agent, isLoading, isError } = useQuery({
    queryKey: ['agent', id],
    queryFn: async () => (await api.get<AgentDetailT>(`/agents/${id}`)).data,
  });
  // Stock nobody holds yet — what can be handed to this agent.
  const { data: free } = useQuery({
    queryKey: ['devices', 'available'],
    queryFn: async () =>
      (await api.get<Device[]>('/devices', { params: { available: 'true' } })).data,
    enabled: assignOpen,
  });
  const candidates = useMemo(
    () => (free ?? []).filter((d) => d.assignedAgent?.id !== id),
    [free, id],
  );

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['agent', id] });
    qc.invalidateQueries({ queryKey: ['agents'] });
    qc.invalidateQueries({ queryKey: ['devices'] });
  };

  const assign = useMutation({
    mutationFn: async (vars: { ids: string[]; agentId: string | null }) =>
      (await api.post('/devices/assign', { deviceIds: vars.ids, agentId: vars.agentId })).data,
    onSuccess: () => {
      setPicked(new Set());
      setAssignOpen(false);
      refresh();
    },
  });
  const update = useMutation({
    mutationFn: async (body: { isActive?: boolean; password?: string }) =>
      (await api.patch(`/agents/${id}`, body)).data,
    onSuccess: () => {
      setPwOpen(false);
      setPassword('');
      refresh();
    },
  });

  usePageTrail([{ label: 'Agents', to: '/agents' }, { label: agent?.fullName ?? 'Agent' }]);

  if (isLoading) {
    return (
      <Center>
        <Spinner />
      </Center>
    );
  }
  if (isError || !agent) {
    return <EmptyState title="Agent not found" hint="They may have been removed." />;
  }

  const financed = agent.sales.reduce((t, s) => t + Number(s.principal), 0);
  const toggle = (did: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(did)) n.delete(did);
      else n.add(did);
      return n;
    });

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <p className="text-lg font-semibold tracking-tight text-ink">{agent.fullName}</p>
            <p className="mt-0.5 text-sm text-muted">
              {agent.email}
              {agent.phone ? ` · ${agent.phone}` : ''}
            </p>
            <div className="mt-2">
              <StatusDot
                status={agent.isActive ? 'ACTIVE' : 'RELEASED'}
                label={agent.isActive ? 'Active' : 'Disabled — cannot sign in or sell'}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setPwOpen(true)}>
              Reset password
            </Button>
            <Button
              variant={agent.isActive ? 'danger' : 'secondary'}
              disabled={update.isPending}
              onClick={() => update.mutate({ isActive: !agent.isActive })}
            >
              {agent.isActive ? 'Disable agent' : 'Re-enable agent'}
            </Button>
          </div>
        </div>
        {update.isError && !pwOpen ? (
          <p className="border-t border-line px-5 py-3 text-sm text-rose-600">
            {apiErrorMessage(update.error)}
          </p>
        ) : null}
      </Card>

      <FigureStrip
        items={[
          { label: 'Phones held', value: agent.stock.length, hint: 'Not yet sold' },
          { label: 'Sales', value: agent.sales.length },
          {
            label: 'Active loans',
            value: agent.sales.filter((s) => s.status === 'ACTIVE').length,
          },
          { label: 'Financed', value: money(financed) },
        ]}
      />

      <Card>
        <CardHeader
          title="Phones held"
          subtitle="Only these can be sold by this agent"
          action={
            agent.isActive ? (
              <Button
                variant="secondary"
                onClick={() => {
                  assign.reset();
                  setPicked(new Set());
                  setAssignOpen(true);
                }}
              >
                <Package className="h-4 w-4" /> Give phones
              </Button>
            ) : undefined
          }
        />
        {agent.stock.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title="No phones with this agent"
              hint="Give them phones from your registered stock so they can sell on credit."
            />
          </div>
        ) : (
          <Table columns={['IMEI', 'Phone', 'Added', '']}>
            {agent.stock.map((d) => (
              <Row key={d.id}>
                <td className="px-4 py-3 font-medium tabular-nums text-ink">{d.imei}</td>
                <td className="px-4 py-3 text-muted">
                  {[d.make, d.model].filter(Boolean).join(' ') || '—'}
                </td>
                <td className="px-4 py-3 text-muted">{shortDate(d.createdAt)}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    className="text-xs font-medium text-brand-600 hover:underline disabled:opacity-50"
                    disabled={assign.isPending}
                    onClick={() => assign.mutate({ ids: [d.id], agentId: null })}
                  >
                    Take back
                  </button>
                </td>
              </Row>
            ))}
          </Table>
        )}
      </Card>

      <Card>
        <CardHeader title="Sales" subtitle="Credit sales this agent made" />
        {agent.sales.length === 0 ? (
          <div className="p-5">
            <EmptyState title="No sales yet" />
          </div>
        ) : (
          <Table columns={['Customer', 'Phone', 'Amount', 'Term', 'Status', 'Sold']}>
            {agent.sales.map((s) => (
              <Row key={s.id} onClick={() => navigate(`/sales/${s.id}`)}>
                <td className="px-4 py-3 font-medium text-ink">{s.customer?.fullName ?? '—'}</td>
                <td className="px-4 py-3 text-muted">
                  {s.device?.imei}
                  {s.device?.model ? ` · ${s.device.model}` : ''}
                </td>
                <td className="px-4 py-3 tabular-nums">{money(s.principal, s.currency)}</td>
                <td className="px-4 py-3 text-muted">{termLabel(s)}</td>
                <td className="px-4 py-3">
                  <StatusDot status={s.status} />
                </td>
                <td className="px-4 py-3 text-right text-muted">{shortDate(s.startDate)}</td>
              </Row>
            ))}
          </Table>
        )}
      </Card>
      <p className="text-xs text-muted">
        <Link to="/register-devices" className="text-brand-600 hover:underline">
          Register more phones
        </Link>{' '}
        to add to stock.
      </p>

      <Modal
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        title={`Give phones to ${agent.fullName}`}
        dirty={picked.size > 0}
        subtitle="Pick from registered phones that have not been sold."
        size="lg"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setAssignOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={picked.size === 0 || assign.isPending}
              onClick={() => assign.mutate({ ids: [...picked], agentId: id! })}
            >
              {assign.isPending ? 'Saving…' : `Give ${picked.size || ''} ${picked.size === 1 ? 'phone' : 'phones'}`}
            </Button>
          </>
        }
      >
        {!free ? (
          <Center>
            <Spinner />
          </Center>
        ) : candidates.length === 0 ? (
          <EmptyState
            title="No phones available"
            hint="Register phones first, then come back to give them to this agent."
          />
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {candidates.map((d) => (
              <li key={d.id}>
                <label className="flex cursor-pointer items-center gap-3 px-4 py-2.5 text-sm hover:bg-canvas/60">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-line accent-brand-600"
                    checked={picked.has(d.id)}
                    onChange={() => toggle(d.id)}
                  />
                  <span className="font-medium tabular-nums text-ink">{d.imei}</span>
                  <span className="text-muted">
                    {[d.make, d.model].filter(Boolean).join(' ') || '—'}
                  </span>
                  {d.assignedAgent ? (
                    <span className="ml-auto text-xs text-amber-700">
                      now with {d.assignedAgent.fullName}
                    </span>
                  ) : null}
                </label>
              </li>
            ))}
          </ul>
        )}
        {assign.isError ? (
          <p className="mt-3 text-sm text-rose-600">{apiErrorMessage(assign.error)}</p>
        ) : null}
      </Modal>

      <Modal
        open={pwOpen}
        onClose={() => setPwOpen(false)}
        title="Reset password"
        dirty={!!password}
        size="sm"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setPwOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="pw-form" disabled={update.isPending || password.length < 8}>
              {update.isPending ? 'Saving…' : 'Set password'}
            </Button>
          </>
        }
      >
        <form
          id="pw-form"
          onSubmit={(e) => {
            e.preventDefault();
            update.mutate({ password });
          }}
        >
          <Field label="New password" hint="At least 8 characters. Tell the agent in person.">
            <Input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />
          </Field>
          {update.isError ? (
            <p className="mt-3 text-sm text-rose-600">{apiErrorMessage(update.error)}</p>
          ) : null}
        </form>
      </Modal>
    </div>
  );
}
