import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, Plus, Trash2 } from '@/shared/icons';
import { api } from '@/shared/api/client';
import { apiErrorMessage } from '@/shared/agreements/apiError';
import type { Agent, Device } from '@/shared/api/types';
import { Button } from '@/shared/components/ui/Button';
import { Card } from '@/shared/components/ui/Card';
import { Field, Input, Select } from '@/shared/components/ui/Field';
import { FieldGrid } from '@/shared/components/ui/FormSection';
import { Modal } from '@/shared/components/ui/Modal';
import { Table, Row } from '@/shared/components/ui/Table';
import { Center, EmptyState, Spinner } from '@/shared/components/ui/misc';
import { FigureStrip } from '@/shared/components/FigureStrip';
import { ListToolbar } from '@/shared/components/ListToolbar';
import { PanelEmpty } from '@/shared/components/Panel';
import { shortDate } from '@/shared/lib/format';
import { useConfirm } from '@/shared/components/ui/ConfirmDialog';

type BulkResult = {
  created: number;
  skipped: string[];
  skippedDetails?: Array<{ imei: string; reason: string }>;
};

/** One IMEI per line (commas, spaces and semicolons also split). */
function parseImeis(text: string): string[] {
  return [...new Set(text.split(/[\s,;]+/).map((t) => t.trim()).filter(Boolean))];
}

/**
 * Phones are registered here ahead of time, with no customer attached. When a
 * customer comes in, the sale wizard simply picks one of these by IMEI.
 */
export function RegisteredTab() {
  const { confirm, dialog } = useConfirm();
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [agentId, setAgentId] = useState('');
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<BulkResult | null>(null);

  const [query, setQuery] = useState('');
  const [holder, setHolder] = useState('ALL');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [assignTo, setAssignTo] = useState('');

  const { data: stock, isLoading } = useQuery({
    queryKey: ['devices', 'available'],
    queryFn: async () =>
      (await api.get<Device[]>('/devices', { params: { available: 'true' } })).data,
  });
  const { data: agents } = useQuery({
    queryKey: ['agents'],
    queryFn: async () => (await api.get<Agent[]>('/agents')).data,
  });
  const activeAgents = (agents ?? []).filter((a) => a.isActive);

  const imeis = useMemo(() => parseImeis(text), [text]);
  const shortOnes = imeis.filter((i) => i.length < 4);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['devices'] });
    qc.invalidateQueries({ queryKey: ['agents'] });
    qc.invalidateQueries({ queryKey: ['agent'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const register = useMutation({
    mutationFn: async () =>
      (
        await api.post<BulkResult>('/devices/bulk', {
          imeis,
          ...(make.trim() ? { make: make.trim() } : {}),
          ...(model.trim() ? { model: model.trim() } : {}),
          ...(agentId ? { assignedAgentId: agentId } : {}),
        })
      ).data,
    onSuccess: (r) => {
      setDone(r);
      setText('');
      setOpen(false);
      refresh();
    },
  });

  const assign = useMutation({
    mutationFn: async (vars: { ids: string[]; agentId: string | null }) =>
      (await api.post('/devices/assign', { deviceIds: vars.ids, agentId: vars.agentId })).data,
    onSuccess: () => {
      setPicked(new Set());
      setAssignTo('');
      refresh();
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/devices/${id}`)).data,
    onSuccess: refresh,
  });

  const counts = useMemo(() => {
    const all = stock ?? [];
    const assigned = all.filter((d) => d.assignedAgent).length;
    return { total: all.length, assigned, shop: all.length - assigned };
  }, [stock]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (stock ?? []).filter((d) => {
      if (holder === 'SHOP' && d.assignedAgent) return false;
      if (holder !== 'ALL' && holder !== 'SHOP' && d.assignedAgent?.id !== holder) return false;
      if (!q) return true;
      return [d.imei, d.make, d.model, d.assignedAgent?.fullName]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [stock, query, holder]);

  const allPicked = rows.length > 0 && rows.every((d) => picked.has(d.id));
  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
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
      {dialog}
      <div className="flex justify-end">
        <Button
          onClick={() => {
            register.reset();
            setDone(null);
            setOpen(true);
          }}
        >
          <Plus className="h-4 w-4" /> Register phones
        </Button>
      </div>

      {done ? (
        <p className="flex items-start gap-2 rounded-xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {done.created} {done.created === 1 ? 'phone' : 'phones'} added to stock.
            {done.skipped.length
              ? ` Already registered, skipped: ${
                  done.skippedDetails?.length
                    ? done.skippedDetails.map((s) => `${s.imei} (${s.reason})`).join('; ')
                    : done.skipped.join(', ')
                }.`
              : ''}
          </span>
        </p>
      ) : null}

      <FigureStrip
        items={[
          { label: 'In stock', value: counts.total, hint: 'Registered, not yet sold' },
          { label: 'With agents', value: counts.assigned },
          { label: 'Held by the shop', value: counts.shop },
        ]}
      />

      <Card>
        <ListToolbar
          title="Phones in stock"
          noun="phone"
          count={rows.length}
          query={query}
          onQuery={setQuery}
          placeholder="Search IMEI, model, agent"
          filter={{
            value: holder,
            onChange: (v) => {
              setHolder(v);
              setPicked(new Set());
            },
            options: [
              { value: 'ALL', label: 'Everyone' },
              { value: 'SHOP', label: 'Held by the shop' },
              ...activeAgents.map((a) => ({ value: a.id, label: a.fullName })),
            ],
          }}
        />

        {picked.size > 0 ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-line-soft bg-canvas/60 px-5 py-2.5 text-sm">
            <span className="font-medium text-ink">{picked.size} selected</span>
            <Select
              value={assignTo}
              onChange={(e) => setAssignTo(e.target.value)}
              className="!w-auto"
              aria-label="Give selected phones to"
            >
              <option value="">Choose who holds them…</option>
              <option value="__shop">Return to the shop</option>
              {activeAgents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.fullName}
                </option>
              ))}
            </Select>
            <Button
              type="button"
              disabled={!assignTo || assign.isPending}
              onClick={async () => {
                const who = assignTo === '__shop' ? null : activeAgents.find((a) => a.id === assignTo);
                const ok = await confirm({
                  title: who ? `Give phones to ${who.fullName}?` : 'Return phones to the shop?',
                  message: who
                    ? `${picked.size} phone${picked.size === 1 ? '' : 's'} will be allocated to ${who.fullName}, who can then sell them on credit.`
                    : `${picked.size} phone${picked.size === 1 ? '' : 's'} will go back to the shop's own stock.`,
                  confirmLabel: 'Apply',
                });
                if (ok)
                  assign.mutate({
                    ids: [...picked],
                    agentId: assignTo === '__shop' ? null : assignTo,
                  });
              }}
            >
              {assign.isPending ? 'Saving…' : 'Apply'}
            </Button>
            <button
              type="button"
              className="text-muted hover:text-ink"
              onClick={() => setPicked(new Set())}
            >
              Clear
            </button>
            {assign.isError ? (
              <span className="text-rose-600">{apiErrorMessage(assign.error)}</span>
            ) : null}
          </div>
        ) : null}

        {!stock || stock.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title="No phones in stock"
              hint="Use Register phones to add some. They stay here until they are sold on credit."
            />
          </div>
        ) : rows.length === 0 ? (
          <PanelEmpty>No phones match your search.</PanelEmpty>
        ) : (
          <Table columns={['', 'IMEI', 'Phone', 'Held by', 'Added', '']}>
            {rows.map((d) => (
              <Row key={d.id}>
                <td className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    aria-label={`Select ${d.imei}`}
                    className="h-4 w-4 rounded border-line accent-brand-600"
                    checked={picked.has(d.id)}
                    onChange={() => toggle(d.id)}
                  />
                </td>
                <td className="px-4 py-3 font-medium tabular-nums text-ink">
                  {d.imei}
                  {d.dormantSince ? (
                    <span className="mt-0.5 block text-xs font-normal text-amber-700">
                      Held for {d.customer?.fullName ?? 'its customer'}'s next loan
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-muted">
                  {[d.make, d.model].filter(Boolean).join(' ') || '—'}
                </td>
                <td className="px-4 py-3 text-muted">
                  {d.assignedAgent ? d.assignedAgent.fullName : 'Shop'}
                </td>
                <td className="px-4 py-3 text-muted">{shortDate(d.createdAt)}</td>
                <td className="px-4 py-3 text-right">
                  {d.dormantSince ? (
                    <Link to={`/devices/${d.id}`} className="text-xs font-medium text-brand-600 hover:underline">
                      Manage
                    </Link>
                  ) : (
                  <button
                    type="button"
                    title="Remove from stock"
                    aria-label={`Remove ${d.imei}`}
                    disabled={remove.isPending}
                    onClick={async () => {
                      const ok = await confirm({
                        title: 'Remove this phone?',
                        message: (
                          <>
                            Remove <span className="font-medium text-ink">{d.imei}</span> from your stock? It has not
                            been sold, so it will simply disappear from the list. You can register it again later.
                          </>
                        ),
                        confirmLabel: 'Remove phone',
                        danger: true,
                      });
                      if (ok) remove.mutate(d.id);
                    }}
                    className="rounded-lg p-1.5 text-muted hover:bg-rose-50 hover:text-rose-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                  )}
                </td>
              </Row>
            ))}
          </Table>
        )}
        {rows.length > 0 ? (
          <div className="border-t border-line-soft px-5 py-2.5">
            <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-muted">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-line accent-brand-600"
                checked={allPicked}
                onChange={() => setPicked(allPicked ? new Set() : new Set(rows.map((d) => d.id)))}
              />
              Select all {rows.length} shown
            </label>
          </div>
        ) : null}
        {remove.isError ? (
          <p className="px-5 pb-3 text-sm text-rose-600">{apiErrorMessage(remove.error)}</p>
        ) : null}
      </Card>
      <Modal
        open={open}
        onClose={() => !register.isPending && setOpen(false)}
        title="Register phones"
        subtitle="Add phones to stock. At the counter you just pick the IMEI. Dial *#06# on a phone to see it."
        dirty={!!(text.trim() || make.trim() || model.trim() || agentId)}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="register-form"
              disabled={register.isPending || imeis.length === 0 || shortOnes.length > 0}
            >
              {register.isPending
                ? 'Registering…'
                : `Register ${imeis.length || ''} ${imeis.length === 1 ? 'phone' : 'phones'}`}
            </Button>
          </>
        }
      >
        <form
          id="register-form"
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            register.mutate();
          }}
        >
          <Field
            label="IMEIs"
            required
            hint="One per line. Paste a whole list to register many phones at once."
            error={
              shortOnes.length ? `Too short to be an IMEI: ${shortOnes.slice(0, 3).join(', ')}` : null
            }
          >
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={5}
              placeholder={'356789012345678\n356789012345679'}
              inputMode="numeric"
              autoFocus
              className="w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 font-mono text-sm text-ink outline-none transition placeholder:text-faint focus:border-brand-400 focus:ring-4 focus:ring-brand-100 flat:rounded-lg flat:bg-elevated flat:text-[13.5px]"
            />
          </Field>
          <FieldGrid>
            <Field label="Make">
              <Input value={make} onChange={(e) => setMake(e.target.value)} placeholder="Tecno" />
            </Field>
            <Field label="Model">
              <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="Spark 20" />
            </Field>
          </FieldGrid>
          <Field label="Give to agent" hint="Optional. Agents only sell phones given to them.">
            <Select value={agentId} onChange={(e) => setAgentId(e.target.value)}>
              <option value="">Keep with the shop</option>
              {activeAgents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.fullName}
                </option>
              ))}
            </Select>
          </Field>
          {register.isError ? (
            <p className="flex items-start gap-2 rounded-xl bg-rose-500/10 px-4 py-3 text-sm text-rose-600 dark:text-rose-400">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {apiErrorMessage(register.error, 'Could not register these phones.')}
            </p>
          ) : null}
        </form>
      </Modal>
    </div>
  );
}
