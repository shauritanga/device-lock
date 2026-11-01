import { useState, type ReactNode } from 'react';
import { Check, Copy, Download } from 'lucide-react';
import { api } from '@/shared/api/client';
import { Button } from '@/shared/components/ui/Button';
import { Card } from '@/shared/components/ui/Card';
import { Pill } from '@/shared/components/ui/Pill';
import { cn } from '@/shared/lib/cn';
import {
  COMMAND_STATUSES,
  DEVICE_STATUSES,
  ENDPOINTS,
  ERROR_TABLE,
  WEBHOOK_EVENTS,
  buildOpenApi,
  type Endpoint,
  type Field,
} from '../docs/api-spec';
import {
  LANGS,
  quickstartSnippet,
  requestSnippet,
  samplePath,
  webhookSnippet,
  type Lang,
} from '../docs/snippets';

const API_ROOT = ((api.defaults.baseURL as string | undefined) ?? '').replace(/\/$/, '');
const BASE = `${API_ROOT}/partner`;

const SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'quickstart', label: 'Quickstart' },
  { id: 'authentication', label: 'Authentication' },
  { id: 'concepts', label: 'How locking works' },
  { id: 'reference', label: 'API reference' },
  { id: 'webhooks', label: 'Webhooks' },
  { id: 'errors', label: 'Errors' },
  { id: 'limits', label: 'Rate limits' },
  { id: 'practices', label: 'Best practices' },
  { id: 'go-live', label: 'Testing & going live' },
  { id: 'openapi', label: 'OpenAPI & changelog' },
] as const;

export function DeveloperDocs({ companyId }: { companyId?: string }) {
  const [lang, setLang] = useState<Lang>('curl');

  const jump = (id: string) =>
    document.getElementById(`docs-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className="grid gap-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
      <aside className="lg:sticky lg:top-4 lg:self-start">
        <nav className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => jump(s.id)}
              className="shrink-0 rounded-lg px-3 py-1.5 text-left text-sm text-muted transition hover:bg-canvas hover:text-ink"
            >
              {s.label}
            </button>
          ))}
        </nav>
        <div className="mt-4 hidden lg:block">
          <p className="mb-1.5 px-3 text-xs font-medium uppercase tracking-wide text-muted">Code samples</p>
          <LangTabs lang={lang} onChange={setLang} vertical />
        </div>
      </aside>

      <div className="min-w-0 space-y-10">
        <div className="lg:hidden">
          <LangTabs lang={lang} onChange={setLang} />
        </div>

        <Section id="overview" title="Overview">
          <p>
            The Device Lock API lets your own system — a loan platform, a CRM, a back office — lock
            and unlock the phones you finance, and find out when it has happened. You decide when a
            phone should be locked; we deliver the command to the phone and tell you the result.
          </p>
          <Facts
            rows={[
              ['Base URL', <Code key="b">{BASE}</Code>],
              ['Format', 'JSON over HTTPS. Timestamps are ISO 8601 in UTC.'],
              ['Authentication', 'API key in the Authorization header.'],
              ['Scope', companyId ? <>Your company only (<Code>{companyId}</Code>). You never send a company id.</> : 'Your company only. You never send a company id.'],
              ['Version', 'v1. Additive changes (new fields, new events) are not breaking — ignore fields you do not know.'],
            ]}
          />
          <Callout tone="info" title="Locking is asynchronous">
            A successful lock or unlock call means <b>accepted</b>, not <b>done</b>. The phone changes
            state when it receives the command, which can be seconds later — or hours if the phone is
            switched off or has no signal. Treat the webhook (or the command status) as the result.
          </Callout>
        </Section>

        <Section id="quickstart" title="Quickstart">
          <p>From nothing to a locked phone in five steps.</p>
          <Steps
            items={[
              <>
                <b>Create an API key.</b> Open the <b>API keys</b> tab, press <i>Create key</i>, and copy
                the key (it starts with <Code>dlk_live_</Code> and is shown once). Save it as a secret on
                your server — for example the environment variable <Code>DEVICELOCK_KEY</Code>.
              </>,
              <>
                <b>Find a phone.</b> Look it up by IMEI. Store the returned <Code>id</Code> against your
                own loan record so you do not need to look it up again.
              </>,
              <>
                <b>Lock it.</b> Send a reason and an <Code>idempotencyKey</Code> you generate (for example
                <Code> loan-1001-lock-1</Code>). You get <Code>202</Code> and a command id.
              </>,
              <>
                <b>Learn the result.</b> Add a webhook endpoint in the <b>Webhooks</b> tab to be told when
                the phone confirms — or poll the command while you are getting started.
              </>,
              <>
                <b>Check the request log.</b> Every call appears under <b>Request log</b>, which is the
                fastest way to debug an integration.
              </>,
            ]}
          />
          <p className="text-sm text-muted">The complete first integration in your language:</p>
          <CodeBlock code={quickstartSnippet(lang, BASE)} />
          <Callout tone="warn" title="This locks a real phone">
            There is no sandbox yet. Run the quickstart against a spare or staff-owned test phone that
            is enrolled and <Code>ACTIVE</Code> — never a customer's. To check your key without any
            risk, create a <b>read-only</b> key and call only the lookup endpoint.
          </Callout>
        </Section>

        <Section id="authentication" title="Authentication">
          <p>
            Send your key as a bearer token on every request. Requests without a valid key get{' '}
            <Code>401</Code>.
          </p>
          <CodeBlock code={`Authorization: Bearer dlk_live_xxxxxxxxxxxxxxxxxxxxxxxx`} />
          <Table
            head={['Key type', 'Can do']}
            rows={[
              ['Full access', 'Look up devices and commands, lock and unlock.'],
              ['Read-only', 'Look up devices and commands only. Lock and unlock return 403.'],
            ]}
          />
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Keys act only on your company. Another company's devices always look like <Code>404</Code>.</li>
            <li>Use one key per system or environment, named so you can tell them apart. You can have up to 10 active keys.</li>
            <li>
              <b>Roll</b> a key if it may have leaked: the old key stops working immediately and a new one
              is shown once. <b>Revoke</b> a key you no longer use.
            </li>
            <li>Keep keys on your server. Never put one in a mobile app, a web page, or source control.</li>
            <li>We store only a hash of your key, so we cannot show it again — roll it if it is lost.</li>
          </ul>
        </Section>

        <Section id="concepts" title="How locking works">
          <H3>The flow</H3>
          <ol className="list-decimal space-y-1.5 pl-5">
            <li>Your system calls <Code>POST /devices/&#123;id&#125;/lock</Code>. We validate it and return <Code>202</Code> with a command.</li>
            <li>We push the command to the phone (with an SMS backup). Status <Code>QUEUED</Code> → <Code>SENT</Code>.</li>
            <li>The phone locks itself and confirms. The command becomes <Code>ACKED</Code>, the device becomes <Code>LOCKED</Code>.</li>
            <li>We send your webhook <Code>device.locked</Code>. If the phone reports a problem, the command becomes <Code>FAILED</Code> and you get <Code>command.failed</Code>.</li>
          </ol>

          <H3>Device status</H3>
          <Table head={['Status', 'Meaning']} rows={DEVICE_STATUSES.map((s) => [<Code key={s.value}>{s.value}</Code>, s.meaning])} />

          <H3>Command status</H3>
          <Table head={['Status', 'Meaning']} rows={COMMAND_STATUSES.map((s) => [<Code key={s.value}>{s.value}</Code>, s.meaning])} />

          <H3>Idempotency</H3>
          <p>
            Networks fail, and your system will retry. Every lock and unlock requires an{' '}
            <Code>idempotencyKey</Code> so a retry can never lock twice or create a duplicate command.
          </p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>The first request with a key is processed and returns <Code>202</Code>.</li>
            <li>A repeat with the same key returns the <b>original command</b> with <Code>200</Code> and <Code>"idempotentReplay": true</Code>. Nothing new is queued.</li>
            <li>Reusing a key for a different device or action returns <Code>409</Code> — a key identifies one specific request.</li>
            <li>Build keys from your own identifiers so they are stable: <Code>loan-1001-lock-1</Code>, <Code>loan-1001-unlock-1</Code>. Use a new key for a genuinely new attempt (<Code>-2</Code>).</li>
            <li>While a lock is still pending for a device, a <i>new</i> lock for it returns <Code>409</Code> rather than stacking up.</li>
          </ul>

          <H3>Offline phones</H3>
          <p>
            A command waits until the phone is reachable. We do not mark it failed just because the
            phone is off. A command that stays <Code>QUEUED</Code> or <Code>SENT</Code> is not an error —
            decide in your own system how long you are willing to wait before escalating (for example,
            calling the customer).
          </p>
        </Section>

        <Section id="reference" title="API reference">
          <p>
            Base URL <Code>{BASE}</Code>. All requests need the <Code>Authorization</Code> header.
            Examples use the language selected on the left.
          </p>
          {ENDPOINTS.map((e) => (
            <EndpointDoc key={e.id} e={e} lang={lang} />
          ))}
        </Section>

        <Section id="webhooks" title="Webhooks">
          <p>
            Webhooks tell your system the moment a phone confirms a lock or unlock, so you do not have
            to poll. Add an endpoint per key in the <b>Webhooks</b> tab and copy its signing secret.
          </p>
          <Table
            head={['Requirement', 'Detail']}
            rows={[
              ['URL', 'https only, publicly reachable. Private, local and internal addresses are rejected.'],
              ['Method', <Code key="m">POST</Code>],
              ['Respond', 'Any 2xx status, within 10 seconds. Redirects are not followed. Acknowledge first, then do your work.'],
              ['Delivery', 'At least once. The same event can arrive more than once; de-duplicate on the event id.'],
              ['Order', 'Not guaranteed. Use the timestamps in the event, or fetch the device for the current state.'],
            ]}
          />

          <H3>Events</H3>
          <Table
            head={['Event', 'Meaning']}
            rows={WEBHOOK_EVENTS.map((w) => [<Code key={w.type}>{w.type}</Code>, w.meaning])}
          />

          <H3>Payload</H3>
          <p>Every event has the same envelope. The <Code>id</Code> is identical across retries.</p>
          <CodeBlock code={JSON.stringify(WEBHOOK_EVENTS[0]!.example, null, 2)} />
          <Table
            head={['data field', 'Description']}
            rows={[
              [<Code key="1">commandId</Code>, 'The command this result belongs to — the id returned when you locked or unlocked.'],
              [<Code key="2">deviceId</Code>, 'The device.'],
              [<Code key="3">commandType</Code>, <><Code>LOCK</Code> or <Code>UNLOCK</Code>.</>],
              [<Code key="4">result</Code>, <><Code>DONE</Code> or <Code>FAILED</Code>.</>],
              [<Code key="5">deviceStatus</Code>, 'The device status after the command; null if it failed.'],
              [<Code key="6">detail</Code>, 'Failure detail from the phone, if any.'],
              [<Code key="7">idempotencyKey</Code>, 'The key you sent, so you can match the result to your own record.'],
              [<Code key="8">occurredAt</Code>, 'When the phone confirmed.'],
            ]}
          />

          <H3>Verify the signature</H3>
          <p>
            Anyone could post to your URL, so check every request. Each delivery carries{' '}
            <Code>X-DeviceLock-Signature: t=&lt;unix seconds&gt;,v1=&lt;hex&gt;</Code>, where{' '}
            <Code>v1</Code> is the HMAC-SHA256 of <Code>&lt;t&gt;.&lt;raw body&gt;</Code> with your signing
            secret. Compute it over the <b>raw request body</b> (before any JSON parsing), compare in
            constant time, and reject timestamps more than 5 minutes old.
          </p>
          <CodeBlock code={webhookSnippet(lang)} />

          <H3>Retries</H3>
          <p>
            If your endpoint does not return 2xx, we retry after 30 seconds, 2 minutes, 8 minutes, 32
            minutes and about 2 hours — six attempts in total — then stop. Failed deliveries stay
            visible in the <b>Webhooks</b> tab. If you were down, fetch the device
            (<Code>GET /devices/&#123;id&#125;</Code>) to catch up.
          </p>
        </Section>

        <Section id="errors" title="Errors">
          <p>Failures return a non-2xx status and a JSON body:</p>
          <CodeBlock code={JSON.stringify({ statusCode: 409, error: 'Conflict', message: 'Device is already locked' }, null, 2)} />
          <p className="text-sm text-muted">
            <Code>message</Code> is a string, or a list of strings for validation errors. Match on the
            status code, not on the message text, which may be reworded.
          </p>
          <Table
            head={['Status', 'Meaning', 'What to do']}
            rows={ERROR_TABLE.map((r) => [
              <span key={r.status} className="whitespace-nowrap font-mono text-xs">{r.status} {r.name}</span>,
              r.meaning,
              r.action,
            ])}
          />
          <p>
            Retry only network failures, <Code>429</Code> and <Code>5xx</Code>, always with the{' '}
            <b>same</b> <Code>idempotencyKey</Code> and exponential backoff (1s, 2s, 4s…). Never retry a{' '}
            <Code>4xx</Code> unchanged.
          </p>
        </Section>

        <Section id="limits" title="Rate limits">
          <p>
            Each key may make <b>60 requests per minute</b> by default. Every response includes:
          </p>
          <Table
            head={['Header', 'Meaning']}
            rows={[
              [<Code key="1">X-RateLimit-Limit</Code>, 'Requests allowed per minute.'],
              [<Code key="2">X-RateLimit-Remaining</Code>, 'Requests left in the current minute.'],
              [<Code key="3">Retry-After</Code>, 'On 429 only: seconds to wait before retrying.'],
            ]}
          />
          <p>
            Need more? Ask your account manager to raise the limit. For bulk work, spread requests
            out instead of sending them in one burst.
          </p>
        </Section>

        <Section id="practices" title="Best practices">
          <ul className="list-disc space-y-2 pl-5">
            <li><b>Store our device id</b> against each loan after the first IMEI lookup. IMEI lookups are for linking, not for every call.</li>
            <li><b>Make your system the decision-maker.</b> Call lock when your own rules say a customer is overdue and unlock when they have paid; do not rely on us to infer it.</li>
            <li><b>Use webhooks as the source of truth</b> and keep polling only as a fallback. Update your record when <Code>device.locked</Code> arrives, not when you send the request.</li>
            <li><b>Reconcile daily.</b> Fetch devices you believe are locked or unlocked and compare with <Code>status</Code>, so a missed webhook never leaves your records wrong.</li>
            <li><b>Check before you act.</b> Unlock only a locked phone, lock only an active one. A <Code>409</Code> usually means your record is out of date — refresh the device.</li>
            <li><b>Always send a clear <Code>reason</Code>.</b> It is kept for audit and helps when a customer disputes a lock.</li>
            <li><b>Set timeouts</b> (10–15 seconds) on your calls, and keep keys and signing secrets in a secret manager.</li>
            <li><b>Respect the law.</b> Make sure your customer agreements allow locking before you send a command.</li>
          </ul>
        </Section>

        <Section id="go-live" title="Testing & going live">
          <H3>Testing</H3>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Create a <b>read-only key</b> first and confirm lookups work. It cannot lock anything.</li>
            <li>Use <b>Send test event</b> in the Webhooks tab to confirm your endpoint receives events and your signature check passes.</li>
            <li>Test locking on a <b>spare enrolled phone</b> you own. Walk through lock, the webhook, unlock, and the webhook again.</li>
            <li>Test the failure paths: send the same <Code>idempotencyKey</Code> twice, lock a phone that is already locked (<Code>409</Code>), and use a bad key (<Code>401</Code>).</li>
            <li>Watch each call in the <b>Request log</b>.</li>
          </ul>
          <H3>Go-live checklist</H3>
          <Checklist
            items={[
              'API key stored in a secret manager, not in code',
              'A full-access key for locking and a separate read-only key for reporting',
              'Webhook endpoint is https, verifies the signature on the raw body, and de-duplicates on the event id',
              'Endpoint acknowledges within 10 seconds and does heavy work afterwards',
              'Retries reuse the same idempotencyKey and back off exponentially',
              '409, 404 and 429 are handled without crashing or retrying blindly',
              'A daily reconciliation compares your records with GET /devices/{id}',
              'You have a plan for phones that stay pending (offline) for a long time',
              'Customer agreements permit device locking',
            ]}
          />
        </Section>

        <Section id="openapi" title="OpenAPI & changelog">
          <p>
            Import the machine-readable definition into Postman, Insomnia or a code generator to get a
            ready-made client.
          </p>
          <div>
            <Button variant="secondary" onClick={() => downloadOpenApi()}>
              <Download className="h-4 w-4" />
              Download openapi.json
            </Button>
          </div>
          <H3>Changelog</H3>
          <Table
            head={['Version', 'Date', 'Change']}
            rows={[['1.0.0', '2026-10-31', 'Initial release: device lookup, lock, unlock, command status, signed webhooks.']]}
          />
        </Section>
      </div>
    </div>
  );
}

function downloadOpenApi() {
  const blob = new Blob([JSON.stringify(buildOpenApi(BASE), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'devicelock-partner-api.openapi.json';
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------

function EndpointDoc({ e, lang }: { e: Endpoint; lang: Lang }) {
  const query = e.query ? Object.fromEntries(e.query.map((q) => [q.name, q.example ?? ''])) : undefined;
  const code = requestSnippet(lang, BASE, {
    method: e.method,
    path: samplePath(e.path, query),
    body: e.bodyExample,
  });
  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone={e.method === 'GET' ? 'blue' : 'brand'}>{e.method}</Pill>
        <code className="break-all text-sm font-semibold">{e.path}</code>
      </div>
      <div>
        <h4 className="text-base font-semibold">{e.summary}</h4>
        <p className="mt-1 text-sm text-ink-soft">{e.description}</p>
      </div>
      {e.pathParams ? <FieldTable title="Path parameters" fields={e.pathParams} /> : null}
      {e.query ? <FieldTable title="Query parameters" fields={e.query} /> : null}
      {e.body ? <FieldTable title="Request body (JSON)" fields={e.body} /> : null}
      <div>
        <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">Request</p>
        <CodeBlock code={code} />
      </div>
      <div className="space-y-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">Responses</p>
        {e.responses.map((r, i) => (
          <div key={`${r.status}-${i}`} className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Pill tone={r.status < 300 ? 'green' : r.status < 500 ? 'amber' : 'red'}>{r.status}</Pill>
              <span className="text-sm text-ink-soft">{r.description}</span>
            </div>
            {r.headers ? (
              <p className="text-xs text-muted">
                Headers: {Object.entries(r.headers).map(([k, v]) => `${k}: ${v}`).join(', ')}
              </p>
            ) : null}
            {r.example !== undefined ? <CodeBlock code={JSON.stringify(r.example, null, 2)} compact /> : null}
          </div>
        ))}
      </div>
    </Card>
  );
}

function FieldTable({ title, fields }: { title: string; fields: Field[] }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">{title}</p>
      <Table
        head={['Name', 'Type', 'Description']}
        rows={fields.map((f) => [
          <span key={f.name} className="whitespace-nowrap">
            <Code>{f.name}</Code>
            {f.required ? <span className="ml-1 text-xs text-rose-600">required</span> : null}
          </span>,
          <span key="t" className="whitespace-nowrap font-mono text-xs text-muted">{f.type}</span>,
          <>
            {f.description}
            {f.example ? <> Example: <Code>{f.example}</Code></> : null}
          </>,
        ])}
      />
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={`docs-${id}`} className="scroll-mt-4 space-y-4 text-sm leading-relaxed text-ink-soft">
      <h2 className="border-b border-line pb-2 text-xl font-bold tracking-tight text-ink">{title}</h2>
      {children}
    </section>
  );
}

function H3({ children }: { children: ReactNode }) {
  return <h3 className="pt-2 text-base font-semibold text-ink">{children}</h3>;
}

function Code({ children }: { children: ReactNode }) {
  return <code className="rounded bg-canvas px-1 py-0.5 font-mono text-[12px] text-ink">{children}</code>;
}

function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="space-y-3">
      {items.map((it, i) => (
        <li key={i} className="flex gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
            {i + 1}
          </span>
          <div className="min-w-0 pt-0.5">{it}</div>
        </li>
      ))}
    </ol>
  );
}

function Checklist({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((t) => (
        <li key={t} className="flex gap-2">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

function Callout({ tone, title, children }: { tone: 'info' | 'warn'; title: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        'rounded-xl border px-4 py-3',
        tone === 'warn' ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-sky-200 bg-sky-50 text-sky-900',
      )}
    >
      <p className="font-semibold">{title}</p>
      <p className="mt-0.5">{children}</p>
    </div>
  );
}

function Facts({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="divide-y divide-line rounded-xl border border-line">
      {rows.map(([k, v]) => (
        <div key={k} className="grid gap-1 px-4 py-2.5 sm:grid-cols-[9rem_1fr]">
          <dt className="font-medium text-ink">{k}</dt>
          <dd className="min-w-0 break-words">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="w-full text-left text-sm">
        <thead className="bg-canvas text-xs uppercase tracking-wide text-muted">
          <tr>
            {head.map((h) => (
              <th key={h} className="px-4 py-2 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r, i) => (
            <tr key={i} className="align-top">
              {r.map((c, j) => (
                <td key={j} className="px-4 py-2">{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LangTabs({ lang, onChange, vertical }: { lang: Lang; onChange: (l: Lang) => void; vertical?: boolean }) {
  return (
    <div className={cn('flex gap-1', vertical ? 'flex-col' : 'overflow-x-auto')}>
      {LANGS.map((l) => (
        <button
          key={l.id}
          onClick={() => onChange(l.id)}
          className={cn(
            'rounded-lg px-3 py-1.5 text-left text-sm font-medium transition',
            lang === l.id ? 'bg-brand-600 text-white' : 'text-muted hover:bg-canvas hover:text-ink',
          )}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}

function CodeBlock({ code, compact }: { code: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="group relative">
      <pre
        className={cn(
          'overflow-x-auto rounded-xl border border-line bg-slate-950 p-4 font-mono text-xs leading-relaxed text-slate-100',
          compact && 'max-h-72',
        )}
      >
        {code}
      </pre>
      <button
        aria-label="Copy"
        onClick={async () => {
          await navigator.clipboard.writeText(code);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="absolute right-2 top-2 rounded-lg bg-white/10 p-1.5 text-slate-200 opacity-0 transition hover:bg-white/20 group-hover:opacity-100 focus:opacity-100"
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      </button>
    </div>
  );
}
