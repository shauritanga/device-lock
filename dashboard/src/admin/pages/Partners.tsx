import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, KeyRound, Plus } from 'lucide-react';
import { api } from '@/shared/api/client';
import { apiErrorMessage } from '@/shared/agreements/apiError';
import { Button } from '@/shared/components/ui/Button';
import { Card } from '@/shared/components/ui/Card';
import { Field, Input, Select } from '@/shared/components/ui/Field';
import { Modal } from '@/shared/components/ui/Modal';
import { StatusPill } from '@/shared/components/ui/Pill';
import { Center, EmptyState, Spinner } from '@/shared/components/ui/misc';
import { Row, Table } from '@/shared/components/ui/Table';
import { shortDate } from '@/shared/lib/format';

type TenantRef = { id: string; name: string };

type PartnerRow = {
  id: string;
  name: string;
  contactEmail: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'REVOKED';
  keyPrefix: string;
  webhookUrl: string | null;
  rateLimitPerMin: number;
  lastUsedAt: string | null;
  createdAt: string;
  grants: { tenant: TenantRef; createdAt?: string }[];
};

type Delivery = {
  id: string;
  eventType: string;
  status: string;
  attempts: number;
  lastStatus: number | null;
  lastError: string | null;
  createdAt: string;
};

type PartnerDetail = PartnerRow & { deliveries: Delivery[] };

/** Secrets returned exactly once by create / rotate. */
type Reveal = { title: string; items: { label: string; value: string }[] };

export default function Partners() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [reveal, setReveal] = useState<Reveal | null>(null);

  const list = useQuery({
    queryKey: ['partners'],
    queryFn: async () => (await api.get<PartnerRow[]>('/partners')).data,
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['partners'] });

  if (list.isLoading) {
    return (
      <Center>
        <Spinner />
      </Center>
    );
  }
  const rows = list.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted">
          Third-party systems that can lock and unlock devices through the partner API. Each
          partner can only act on companies you grant it.
        </p>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          New partner
        </Button>
      </div>

      <Card>
        {rows.length === 0 ? (
          <EmptyState
            title="No API partners yet"
            hint="Create one to issue an API key and webhook secret."
          />
        ) : (
          <div className="overflow-x-auto">
            <Table columns={['Partner', 'Key', 'Companies', 'Rate limit', 'Last used', 'Status', '']}>
              {rows.map((p) => (
                <Row key={p.id}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-ink">{p.name}</p>
                    <p className="text-xs text-muted">{p.contactEmail}</p>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted">{p.keyPrefix}…</td>
                  <td className="px-4 py-3 text-muted">
                    {p.grants.length === 0
                      ? 'None'
                      : p.grants.map((g) => g.tenant.name).join(', ')}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-muted">{p.rateLimitPerMin}/min</td>
                  <td className="px-4 py-3 text-muted">{shortDate(p.lastUsedAt)}</td>
                  <td className="px-4 py-3">
                    <StatusPill status={p.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="secondary"
                      className="!py-1.5 !text-xs"
                      onClick={() => setOpenId(p.id)}
                    >
                      Manage
                    </Button>
                  </td>
                </Row>
              ))}
            </Table>
          </div>
        )}
      </Card>

      <CreatePartner
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(r) => {
          setCreateOpen(false);
          setReveal(r);
          refresh();
        }}
      />

      {openId ? (
        <PartnerDetailModal
          id={openId}
          onClose={() => setOpenId(null)}
          onChanged={refresh}
          onReveal={setReveal}
        />
      ) : null}

      <Modal
        open={!!reveal}
        onClose={() => setReveal(null)}
        title={reveal?.title ?? ''}
        className="max-w-xl"
      >
        <div className="space-y-4">
          <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Copy these now. They are shown only once and cannot be recovered. You can rotate
            them later if they are lost.
          </p>
          {reveal?.items.map((i) => <CopyBox key={i.label} label={i.label} value={i.value} />)}
          <div className="flex justify-end">
            <Button onClick={() => setReveal(null)}>I've saved them</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function CopyBox({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <p className="mb-1 text-sm font-medium text-ink">{label}</p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 break-all rounded-xl border border-line bg-canvas px-3 py-2 text-xs">
          {value}
        </code>
        <Button
          type="button"
          variant="secondary"
          onClick={async () => {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}

function useTenants() {
  return useQuery({
    queryKey: ['tenants'],
    queryFn: async () => (await api.get<TenantRef[]>('/tenants')).data,
  });
}

function CreatePartner({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (r: Reveal) => void;
}) {
  const tenants = useTenants();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [rate, setRate] = useState('60');
  const [selected, setSelected] = useState<string[]>([]);

  const create = useMutation({
    mutationFn: async () =>
      (
        await api.post<{ apiKey: string; webhookSecret: string; name: string }>('/partners', {
          name,
          contactEmail: email,
          webhookUrl: webhookUrl || undefined,
          rateLimitPerMin: Number(rate),
          tenantIds: selected,
        })
      ).data,
    onSuccess: (r) => {
      onCreated({
        title: `${r.name} created`,
        items: [
          { label: 'API key', value: r.apiKey },
          { label: 'Webhook signing secret', value: r.webhookSecret },
        ],
      });
      setName('');
      setEmail('');
      setWebhookUrl('');
      setSelected([]);
    },
  });

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <Modal open={open} onClose={onClose} title="New API partner" className="max-w-xl">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <Field label="Partner name" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Technical contact email" required>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Webhook URL" hint="https only. Lock results are POSTed here, signed.">
          <Input
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder="https://partner.example.com/hooks/devicelock"
          />
        </Field>
        <Field label="Rate limit (requests per minute)">
          <Input type="number" min={1} max={6000} value={rate} onChange={(e) => setRate(e.target.value)} />
        </Field>
        <div>
          <p className="mb-1.5 text-sm font-medium text-ink">Companies it may act on</p>
          <div className="max-h-40 space-y-1 overflow-y-auto rounded-xl border border-line p-2">
            {(tenants.data ?? []).map((t) => (
              <label key={t.id} className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-canvas">
                <input
                  type="checkbox"
                  checked={selected.includes(t.id)}
                  onChange={() => toggle(t.id)}
                />
                {t.name}
              </label>
            ))}
          </div>
        </div>
        {create.isError ? (
          <p className="text-sm text-rose-600">{apiErrorMessage(create.error)}</p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!name.trim() || !email.trim() || create.isPending}>
            <KeyRound className="h-4 w-4" />
            {create.isPending ? 'Creating…' : 'Create & issue key'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function PartnerDetailModal({
  id,
  onClose,
  onChanged,
  onReveal,
}: {
  id: string;
  onClose: () => void;
  onChanged: () => void;
  onReveal: (r: Reveal) => void;
}) {
  const qc = useQueryClient();
  const tenants = useTenants();
  const [grantId, setGrantId] = useState('');
  const [webhookUrl, setWebhookUrl] = useState<string | null>(null);

  const detail = useQuery({
    queryKey: ['partners', id],
    queryFn: async () => (await api.get<PartnerDetail>(`/partners/${id}`)).data,
  });

  const done = () => {
    qc.invalidateQueries({ queryKey: ['partners'] });
    onChanged();
  };
  const act = useMutation({
    mutationFn: async (fn: () => Promise<unknown>) => fn(),
    onSuccess: done,
  });

  const p = detail.data;
  const revoked = p?.status === 'REVOKED';
  const granted = new Set(p?.grants.map((g) => g.tenant.id));
  const available = (tenants.data ?? []).filter((t) => !granted.has(t.id));
  const url = webhookUrl ?? p?.webhookUrl ?? '';

  return (
    <Modal open onClose={onClose} title={p?.name ?? 'Partner'} className="max-w-3xl">
      {!p ? (
        <Center>
          <Spinner />
        </Center>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={p.status} />
            <span className="font-mono text-xs text-muted">{p.keyPrefix}…</span>
            <div className="ml-auto flex flex-wrap gap-2">
              {!revoked ? (
                <>
                  <Button
                    variant="secondary"
                    onClick={() =>
                      act.mutate(() =>
                        api.patch(`/partners/${id}`, {
                          status: p.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE',
                        }),
                      )
                    }
                  >
                    {p.status === 'ACTIVE' ? 'Suspend' : 'Reactivate'}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      if (!window.confirm('Rotate the API key? The old key stops working immediately.')) return;
                      act.mutate(async () => {
                        const r = (await api.post<{ apiKey: string }>(`/partners/${id}/rotate-key`)).data;
                        onReveal({ title: 'New API key', items: [{ label: 'API key', value: r.apiKey }] });
                      });
                    }}
                  >
                    Rotate key
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => {
                      if (window.confirm('Revoke this partner permanently? This cannot be undone.')) {
                        act.mutate(() => api.post(`/partners/${id}/revoke`));
                      }
                    }}
                  >
                    Revoke
                  </Button>
                </>
              ) : null}
            </div>
          </div>

          {act.isError ? <p className="text-sm text-rose-600">{apiErrorMessage(act.error)}</p> : null}

          <section className="space-y-2">
            <h4 className="text-sm font-semibold">Companies</h4>
            {p.grants.length === 0 ? (
              <p className="text-sm text-muted">No access granted — every call is refused.</p>
            ) : (
              <ul className="divide-y divide-line rounded-xl border border-line">
                {p.grants.map((g) => (
                  <li key={g.tenant.id} className="flex items-center justify-between px-3 py-2 text-sm">
                    {g.tenant.name}
                    {!revoked ? (
                      <button
                        className="text-xs font-medium text-rose-600 hover:underline"
                        onClick={() => act.mutate(() => api.delete(`/partners/${id}/grants/${g.tenant.id}`))}
                      >
                        Remove
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            {!revoked && available.length > 0 ? (
              <div className="flex gap-2">
                <Select value={grantId} onChange={(e) => setGrantId(e.target.value)}>
                  <option value="">Grant access to…</option>
                  {available.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
                <Button
                  variant="secondary"
                  disabled={!grantId}
                  onClick={() => {
                    act.mutate(() => api.post(`/partners/${id}/grants`, { tenantId: grantId }));
                    setGrantId('');
                  }}
                >
                  Grant
                </Button>
              </div>
            ) : null}
          </section>

          {!revoked ? (
            <section className="space-y-2">
              <h4 className="text-sm font-semibold">Webhook</h4>
              <div className="flex gap-2">
                <Input
                  value={url}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  placeholder="https://partner.example.com/hooks/devicelock"
                />
                <Button
                  variant="secondary"
                  disabled={webhookUrl === null || webhookUrl === (p.webhookUrl ?? '')}
                  onClick={() => {
                    act.mutate(() => api.patch(`/partners/${id}`, { webhookUrl: url.trim() || null }));
                    setWebhookUrl(null);
                  }}
                >
                  Save
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="ghost"
                  disabled={!p.webhookUrl}
                  onClick={() => act.mutate(() => api.post(`/partners/${id}/test-webhook`))}
                >
                  Send test event
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    if (!window.confirm('Rotate the webhook secret? Update the partner before the next delivery.')) return;
                    act.mutate(async () => {
                      const r = (await api.post<{ webhookSecret: string }>(`/partners/${id}/rotate-webhook-secret`)).data;
                      onReveal({
                        title: 'New webhook secret',
                        items: [{ label: 'Webhook signing secret', value: r.webhookSecret }],
                      });
                    });
                  }}
                >
                  Rotate secret
                </Button>
              </div>
            </section>
          ) : null}

          <section className="space-y-2">
            <h4 className="text-sm font-semibold">Recent webhook deliveries</h4>
            {p.deliveries.length === 0 ? (
              <p className="text-sm text-muted">Nothing delivered yet.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-line">
                <Table columns={['Event', 'When', 'Attempts', 'Result']}>
                  {p.deliveries.map((d) => (
                    <Row key={d.id}>
                      <td className="px-4 py-2 font-mono text-xs">{d.eventType}</td>
                      <td className="px-4 py-2 text-muted">{shortDate(d.createdAt)}</td>
                      <td className="px-4 py-2 tabular-nums text-muted">{d.attempts}</td>
                      <td className="px-4 py-2">
                        <StatusPill status={d.status} />
                        {d.lastError ? (
                          <span className="ml-2 text-xs text-muted">{d.lastError}</span>
                        ) : null}
                      </td>
                    </Row>
                  ))}
                </Table>
              </div>
            )}
          </section>
        </div>
      )}
    </Modal>
  );
}
