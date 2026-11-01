import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Check, Copy, KeyRound, Plus, ScrollText, Webhook } from 'lucide-react';
import { api } from '@/shared/api/client';
import { apiErrorMessage } from '@/shared/agreements/apiError';
import { Button } from '@/shared/components/ui/Button';
import { Card } from '@/shared/components/ui/Card';
import { Field, Input } from '@/shared/components/ui/Field';
import { Modal } from '@/shared/components/ui/Modal';
import { Pill, StatusPill } from '@/shared/components/ui/Pill';
import { Center, EmptyState, Spinner } from '@/shared/components/ui/misc';
import { Row, Table } from '@/shared/components/ui/Table';
import { cn } from '@/shared/lib/cn';
import { DeveloperDocs } from './DeveloperDocs';
import { shortDate } from '@/shared/lib/format';

type Key = {
  id: string;
  name: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'REVOKED';
  keyPrefix: string;
  webhookUrl: string | null;
  readOnly: boolean;
  lastUsedAt: string | null;
  createdAt: string;
};

type Delivery = {
  id: string;
  eventType: string;
  status: string;
  attempts: number;
  lastError: string | null;
  createdAt: string;
};

type KeyDetail = Key & { deliveries: Delivery[] };

type LogRow = {
  id: string;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  createdAt: string;
  apiClient: { id: string; name: string; keyPrefix: string };
};

type Reveal = { title: string; items: { label: string; value: string }[] };

const TABS = [
  { id: 'keys', label: 'API keys', icon: KeyRound },
  { id: 'webhooks', label: 'Webhooks', icon: Webhook },
  { id: 'logs', label: 'Request log', icon: ScrollText },
  { id: 'docs', label: 'Documentation', icon: BookOpen },
] as const;
type TabId = (typeof TABS)[number]['id'];

export default function Developers() {
  const [tab, setTab] = useState<TabId>('keys');
  const [reveal, setReveal] = useState<Reveal | null>(null);

  const overview = useQuery({
    queryKey: ['developers', 'overview'],
    queryFn: async () =>
      (await api.get<{ company: { id: string; name: string } }>('/developers/overview')).data,
  });

  return (
    <div className="space-y-6">
      <p className="max-w-3xl text-sm text-muted">
        Connect your own systems to lock and unlock the phones you finance. Keys you create here
        work only for <span className="font-medium text-ink">{overview.data?.company.name ?? 'your company'}</span>.
      </p>

      <div className="flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'inline-flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition',
              tab === t.id
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-muted hover:text-ink',
            )}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'keys' ? <KeysTab onReveal={setReveal} /> : null}
      {tab === 'webhooks' ? <WebhooksTab onReveal={setReveal} /> : null}
      {tab === 'logs' ? <LogsTab /> : null}
      {tab === 'docs' ? <DeveloperDocs companyId={overview.data?.company.id} /> : null}

      <Modal open={!!reveal} onClose={() => setReveal(null)} title={reveal?.title ?? ''} className="max-w-xl">
        <div className="space-y-4">
          <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Copy this now — it is shown only once. Store it in your server's secret manager, never
            in a mobile app or website. If it is lost, roll it to get a new one.
          </p>
          {reveal?.items.map((i) => <CopyBox key={i.label} label={i.label} value={i.value} />)}
          <div className="flex justify-end">
            <Button onClick={() => setReveal(null)}>I've saved it</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function useKeys() {
  return useQuery({
    queryKey: ['developers', 'keys'],
    queryFn: async () => (await api.get<Key[]>('/developers/keys')).data,
  });
}

function CopyBox({ label, value, multiline }: { label?: string; value: string; multiline?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      {label ? <p className="mb-1 text-sm font-medium text-ink">{label}</p> : null}
      <div className="flex items-start gap-2">
        {multiline ? (
          <pre className="min-w-0 flex-1 overflow-x-auto rounded-xl border border-line bg-canvas px-3 py-2 text-xs leading-relaxed">
            {value}
          </pre>
        ) : (
          <code className="min-w-0 flex-1 break-all rounded-xl border border-line bg-canvas px-3 py-2 text-xs">
            {value}
          </code>
        )}
        <Button
          type="button"
          variant="secondary"
          aria-label="Copy"
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

function KeysTab({ onReveal }: { onReveal: (r: Reveal) => void }) {
  const qc = useQueryClient();
  const keys = useKeys();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [readOnly, setReadOnly] = useState(false);

  const refresh = () => qc.invalidateQueries({ queryKey: ['developers'] });

  const create = useMutation({
    mutationFn: async () =>
      (await api.post<Key & { apiKey: string }>('/developers/keys', { name, readOnly })).data,
    onSuccess: (r) => {
      setCreateOpen(false);
      setName('');
      setReadOnly(false);
      onReveal({ title: `${r.name} created`, items: [{ label: 'API key', value: r.apiKey }] });
      refresh();
    },
  });

  const roll = useMutation({
    mutationFn: async (k: Key) =>
      (await api.post<{ apiKey: string }>(`/developers/keys/${k.id}/roll`)).data,
    onSuccess: (r, k) => {
      onReveal({ title: `New key for ${k.name}`, items: [{ label: 'API key', value: r.apiKey }] });
      refresh();
    },
  });
  const revoke = useMutation({
    mutationFn: async (k: Key) => (await api.post(`/developers/keys/${k.id}/revoke`)).data,
    onSuccess: refresh,
  });

  if (keys.isLoading) return <Center><Spinner /></Center>;
  const rows = keys.data ?? [];
  const error = roll.error ?? revoke.error;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">
          Send the key as <code className="rounded bg-canvas px-1 text-xs">Authorization: Bearer …</code> from your
          server. Use a read-only key for reporting.
        </p>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          Create key
        </Button>
      </div>
      {error ? <p className="text-sm text-rose-600">{apiErrorMessage(error)}</p> : null}

      <Card>
        {rows.length === 0 ? (
          <EmptyState title="No API keys yet" hint="Create a key to start calling the API." />
        ) : (
          <Table columns={['Name', 'Key', 'Access', 'Created', 'Last used', 'Status', '']}>
            {rows.map((k) => (
              <Row key={k.id}>
                <td className="px-4 py-3 font-medium text-ink">{k.name}</td>
                <td className="px-4 py-3 font-mono text-xs text-muted">{k.keyPrefix}…</td>
                <td className="px-4 py-3">
                  <Pill tone={k.readOnly ? 'blue' : 'brand'}>{k.readOnly ? 'Read only' : 'Lock & unlock'}</Pill>
                </td>
                <td className="px-4 py-3 text-muted">{shortDate(k.createdAt)}</td>
                <td className="px-4 py-3 text-muted">{shortDate(k.lastUsedAt)}</td>
                <td className="px-4 py-3"><StatusPill status={k.status} /></td>
                <td className="px-4 py-3 text-right">
                  {k.status === 'REVOKED' ? null : (
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="secondary"
                        className="!py-1.5 !text-xs"
                        disabled={roll.isPending}
                        onClick={() => {
                          if (window.confirm(`Roll "${k.name}"? The current key stops working immediately.`)) roll.mutate(k);
                        }}
                      >
                        Roll
                      </Button>
                      <Button
                        variant="danger"
                        className="!py-1.5 !text-xs"
                        disabled={revoke.isPending}
                        onClick={() => {
                          if (window.confirm(`Revoke "${k.name}" permanently?`)) revoke.mutate(k);
                        }}
                      >
                        Revoke
                      </Button>
                    </div>
                  )}
                </td>
              </Row>
            ))}
          </Table>
        )}
      </Card>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create API key" className="max-w-md">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <Field label="Key name" required hint="Something that tells you where it's used, e.g. “Loan system – production”.">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <label className="flex items-start gap-2.5 text-sm text-ink-soft">
            <input
              type="checkbox"
              checked={readOnly}
              onChange={(e) => setReadOnly(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-line"
            />
            <span>
              <span className="font-medium text-ink">Read-only</span> — can look up devices and
              commands but cannot lock or unlock.
            </span>
          </label>
          {create.isError ? <p className="text-sm text-rose-600">{apiErrorMessage(create.error)}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={name.trim().length < 2 || create.isPending}>
              {create.isPending ? 'Creating…' : 'Create key'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function WebhooksTab({ onReveal }: { onReveal: (r: Reveal) => void }) {
  const keys = useKeys();
  const [selected, setSelected] = useState<string | null>(null);
  const active = (keys.data ?? []).filter((k) => k.status !== 'REVOKED');
  const id = selected ?? active[0]?.id ?? null;

  if (keys.isLoading) return <Center><Spinner /></Center>;
  if (active.length === 0) {
    return (
      <Card>
        <EmptyState title="Create an API key first" hint="Webhooks are configured per key." />
      </Card>
    );
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted">Key</span>
        {active.map((k) => (
          <button
            key={k.id}
            onClick={() => setSelected(k.id)}
            className={cn(
              'rounded-full border px-3 py-1 text-sm transition',
              k.id === id ? 'border-brand-400 bg-brand-50 text-brand-700' : 'border-line text-muted hover:text-ink',
            )}
          >
            {k.name}
          </button>
        ))}
      </div>
      {id ? <WebhookPanel key={id} id={id} onReveal={onReveal} /> : null}
    </div>
  );
}

function WebhookPanel({ id, onReveal }: { id: string; onReveal: (r: Reveal) => void }) {
  const qc = useQueryClient();
  const detail = useQuery({
    queryKey: ['developers', 'keys', id],
    queryFn: async () => (await api.get<KeyDetail>(`/developers/keys/${id}`)).data,
    refetchInterval: 10_000,
  });
  const [url, setUrl] = useState<string | null>(null);
  const done = () => qc.invalidateQueries({ queryKey: ['developers'] });

  const save = useMutation({
    mutationFn: async (value: string | null) =>
      (await api.patch(`/developers/keys/${id}`, { webhookUrl: value })).data,
    onSuccess: () => {
      setUrl(null);
      done();
    },
  });
  const test = useMutation({
    mutationFn: async () => (await api.post(`/developers/keys/${id}/test-webhook`)).data,
    onSuccess: done,
  });
  const rollSecret = useMutation({
    mutationFn: async () =>
      (await api.post<{ webhookSecret: string }>(`/developers/keys/${id}/webhook-secret/roll`)).data,
    onSuccess: (r) =>
      onReveal({ title: 'New signing secret', items: [{ label: 'Webhook signing secret', value: r.webhookSecret }] }),
  });

  const d = detail.data;
  if (!d) return <Center><Spinner /></Center>;
  const value = url ?? d.webhookUrl ?? '';
  const err = save.error ?? test.error ?? rollSecret.error;

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-5">
        <Field label="Endpoint URL" hint="https only, publicly reachable. We POST signed JSON when a phone confirms a lock or unlock.">
          <Input
            value={value}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://your-system.example.com/hooks/devicelock"
          />
        </Field>
        {err ? <p className="text-sm text-rose-600">{apiErrorMessage(err)}</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={url === null || save.isPending}
            onClick={() => save.mutate(url!.trim() || null)}
          >
            Save endpoint
          </Button>
          <Button variant="secondary" disabled={!d.webhookUrl || test.isPending} onClick={() => test.mutate()}>
            Send test event
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              if (window.confirm('Roll the signing secret? Update your system before the next delivery.')) rollSecret.mutate();
            }}
          >
            Roll signing secret
          </Button>
        </div>
      </Card>

      <Card>
        <div className="border-b border-line px-5 py-3 text-sm font-semibold">Recent deliveries</div>
        {d.deliveries.length === 0 ? (
          <EmptyState title="No deliveries yet" hint="Send a test event to check your endpoint." />
        ) : (
          <Table columns={['Event', 'Sent', 'Attempts', 'Result']}>
            {d.deliveries.map((x) => (
              <Row key={x.id}>
                <td className="px-4 py-2 font-mono text-xs">{x.eventType}</td>
                <td className="px-4 py-2 text-muted">{shortDate(x.createdAt)}</td>
                <td className="px-4 py-2 tabular-nums text-muted">{x.attempts}</td>
                <td className="px-4 py-2">
                  <StatusPill status={x.status} />
                  {x.lastError ? <span className="ml-2 text-xs text-muted">{x.lastError}</span> : null}
                </td>
              </Row>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}

function LogsTab() {
  const logs = useQuery({
    queryKey: ['developers', 'logs'],
    queryFn: async () => (await api.get<LogRow[]>('/developers/logs?limit=100')).data,
    refetchInterval: 10_000,
  });
  if (logs.isLoading) return <Center><Spinner /></Center>;
  const rows = logs.data ?? [];
  return (
    <Card>
      {rows.length === 0 ? (
        <EmptyState title="No requests yet" hint="Calls made with your API keys appear here for 30 days." />
      ) : (
        <Table columns={['Time', 'Key', 'Request', 'Status', 'Duration']}>
          {rows.map((r) => (
            <Row key={r.id}>
              <td className="whitespace-nowrap px-4 py-2 text-muted">{new Date(r.createdAt).toLocaleString()}</td>
              <td className="px-4 py-2 text-muted">{r.apiClient.name}</td>
              <td className="px-4 py-2 font-mono text-xs">
                <span className="font-semibold">{r.method}</span> {r.path}
              </td>
              <td className="px-4 py-2">
                <Pill tone={r.status < 300 ? 'green' : r.status < 500 ? 'amber' : 'red'}>{r.status}</Pill>
              </td>
              <td className="px-4 py-2 tabular-nums text-muted">{r.durationMs} ms</td>
            </Row>
          ))}
        </Table>
      )}
    </Card>
  );
}
