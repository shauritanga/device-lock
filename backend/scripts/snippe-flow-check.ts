/**
 * End-to-end check of the Snippe collect -> disburse flow against a FAKE Snippe
 * server. Never touches the real gateway or moves real money.
 *
 *   createdb linda_test && DATABASE_URL=<linda_test url> npx prisma migrate deploy
 *   npm run build
 *   TEST_DATABASE_URL=<linda_test url> npm run test:snippe
 *
 * It boots the built backend as a child process pointed at the fake gateway and
 * at TEST_DATABASE_URL (use a throwaway database), then drives it over HTTP with
 * correctly-signed webhooks.
 */
import { createHmac } from 'crypto';
import { spawn } from 'child_process';
import http from 'http';
import * as argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';

const DB_URL = process.env.TEST_DATABASE_URL;
if (!DB_URL || !/test/i.test(DB_URL)) {
  console.error('Set TEST_DATABASE_URL to a throwaway database (name must contain "test")');
  process.exit(2);
}
const API_PORT = 3199;
const FAKE_PORT = 4199;
const SECRET = 'whsec_test_secret';
const PAYOUT_FEE = 500;
const API = `http://localhost:${API_PORT}`;

// ---------------------------------------------------------------- fake Snippe
const payments = new Map<string, any>();
const payouts = new Map<string, any>();
const calls: { method: string; path: string; headers: any; body: any }[] = [];
let nextPayoutFails: string | null = null;
let reuseRefNext: string | null = null;

const fake = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    const url = new URL(req.url!, 'http://x');
    const body = raw ? JSON.parse(raw) : undefined;
    calls.push({ method: req.method!, path: url.pathname + url.search, headers: req.headers, body });
    const send = (code: number, data: any) => {
      res.writeHead(code, { 'content-type': 'application/json' });
      res.end(JSON.stringify(code < 300 ? { status: 'success', code, data } : data));
    };
    if (req.headers.authorization !== 'Bearer snp_test') return send(401, { status: 'error', error_code: 'unauthorized', message: 'bad key' });

    if (req.method === 'POST' && url.pathname === '/v1/payments') {
      if (reuseRefNext) {
        const existing = payments.get(reuseRefNext);
        reuseRefNext = null;
        return send(201, existing); // Snippe answering a repeat request with the reference it already issued
      }
      const ref = `pay-${payments.size + 1}`;
      const p = {
        reference: ref, status: 'pending', object: 'payment',
        amount: { currency: 'TZS', value: body.details.amount },
        metadata: body.metadata,
      };
      payments.set(ref, p);
      return send(201, p);
    }
    const pm = url.pathname.match(/^\/v1\/payments\/(.+)$/);
    if (req.method === 'GET' && pm) {
      const p = payments.get(pm[1]);
      return p ? send(200, p) : send(404, { status: 'error', error_code: 'not_found', message: 'nf' });
    }
    if (req.method === 'GET' && url.pathname === '/v1/payouts/fee') {
      const amount = Number(url.searchParams.get('amount'));
      return send(200, { amount, fee_amount: PAYOUT_FEE, total_amount: amount + PAYOUT_FEE, currency: 'TZS' });
    }
    if (req.method === 'POST' && url.pathname === '/v1/payouts/send') {
      if (nextPayoutFails) {
        const message = nextPayoutFails;
        nextPayoutFails = null;
        return send(500, { status: 'error', code: 500, error_code: 'payment_failed', message });
      }
      const key = req.headers['idempotency-key'] as string;
      const existing = [...payouts.values()].find((p) => p.key === key);
      if (existing) return send(201, existing);
      const ref = `po-${payouts.size + 1}`;
      const p = { reference: ref, key, status: 'pending', object: 'payout', amount: { currency: 'TZS', value: body.amount }, recipient: { name: body.recipient_name, phone: body.recipient_phone }, metadata: body.metadata };
      payouts.set(ref, p);
      return send(201, p);
    }
    const om = url.pathname.match(/^\/v1\/payouts\/(.+)$/);
    if (req.method === 'GET' && om) {
      const p = payouts.get(om[1]);
      return p ? send(200, p) : send(404, { status: 'error', error_code: 'not_found', message: 'nf' });
    }
    send(404, { status: 'error', error_code: 'not_found', message: 'nf' });
  });
});

// ------------------------------------------------------------------- helpers
let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  console.log(`${cond ? '✅ PASS' : '❌ FAIL'}  ${name}${!cond && extra !== undefined ? '  -> ' + JSON.stringify(extra) : ''}`);
  cond ? pass++ : fail++;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until<T>(fn: () => Promise<T | false | null | undefined>, ms = 8000): Promise<T | undefined> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await sleep(150);
  }
  return undefined;
}

async function webhook(type: string, data: any, opts: { secret?: string; ts?: number } = {}) {
  const raw = JSON.stringify({ id: `evt_${Math.random()}`, type, api_version: '2026-01-25', data });
  const ts = String(opts.ts ?? Math.floor(Date.now() / 1000));
  const sig = createHmac('sha256', opts.secret ?? SECRET).update(`${ts}.${raw}`).digest('hex');
  const r = await fetch(`${API}/v1/webhooks/snippe`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-webhook-timestamp': ts, 'x-webhook-signature': sig, 'x-webhook-event': type },
    body: raw,
  });
  return { status: r.status, json: await r.json().catch(() => ({})) };
}

async function main() {
  const db = new PrismaClient({ datasources: { db: { url: DB_URL } } });
  await new Promise<void>((r) => fake.listen(FAKE_PORT, r));

  const childEnv: NodeJS.ProcessEnv = { ...process.env };
  delete childEnv.RLS_DATABASE_URL;
  const child = spawn('node', ['dist/main.js'], {
    env: {
      ...childEnv,
      DATABASE_URL: DB_URL, PORT: String(API_PORT), NODE_ENV: 'development',
      SNIPPE_BASE_URL: `http://localhost:${FAKE_PORT}`, SNIPPE_API_KEY: 'snp_test', SNIPPE_WEBHOOK_SECRET: SECRET,
      PUBLIC_BASE_URL: 'http://localhost', // non-https => no webhook_url sent
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (d) => (log += d));
  child.stderr.on('data', (d) => (log += d));

  const suffix = Date.now().toString(36);
  let tenantId = '';
  try {
    if (!(await until(async () => (await fetch(`${API}/v1/auth/login`, { method: 'POST' }).then(() => true).catch(() => false)) || null, 30000))) {
      throw new Error('backend did not start:\n' + log.slice(-2000));
    }

    // ---- fixtures
    const tenant = await db.tenant.create({ data: { name: `T-${suffix}`, subscriptionRequired: false, payoutPhone: '0712345678', payoutName: 'Shop Owner' } });
    tenantId = tenant.id;
    const noAcct = await db.tenant.create({ data: { name: `NA-${suffix}`, subscriptionRequired: false } });
    const customer = await db.customer.create({ data: { tenantId, fullName: 'Asha Juma Mwinyi', phone: '255700000001' } });
    const device = await db.device.create({ data: { tenantId, customerId: customer.id, imei: `imei-${suffix}`, status: 'ACTIVE' } });
    const loan = await db.loan.create({ data: { tenantId, customerId: customer.id, deviceId: device.id, principal: 200000, termMonths: 2, termPeriods: 2 } });
    for (const seq of [1, 2]) {
      await db.installment.create({ data: { tenantId, loanId: loan.id, sequence: seq, dueDate: new Date(Date.now() + seq * 30 * 864e5), amount: 100000 } });
    }
    await db.user.create({ data: { tenantId, email: `o-${suffix}@t.test`, fullName: 'Owner', role: 'OWNER', passwordHash: await argon2.hash('pw12345678', { type: argon2.argon2id }) } });
    await db.user.upsert({ where: { email: 'admin@linda.co.tz' }, update: {}, create: { email: 'admin@linda.co.tz', fullName: 'Admin', role: 'SUPER_ADMIN', passwordHash: await argon2.hash('Linda@2026', { type: argon2.argon2id }) } });
    const { accessToken } = await (await fetch(`${API}/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `o-${suffix}@t.test`, password: 'pw12345678' }) })).json() as any;
    const auth = { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' };
    const pay = async (amount: number) => {
      const r = await fetch(`${API}/v1/payments/mobile`, { method: 'POST', headers: auth, body: JSON.stringify({ loanId: loan.id, amount, phoneNumber: '0755111222' }) });
      return { status: r.status, json: (await r.json()) as any };
    };
    const complete = async (ref: string, gross: number, net: number) => {
      const p = payments.get(ref);
      p.status = 'completed';
      p.settlement = { gross: { currency: 'TZS', value: gross }, fees: { currency: 'TZS', value: gross - net }, net: { currency: 'TZS', value: net } };
      p.channel = { type: 'mobile_money', provider: 'airtel' };
      return webhook('payment.completed', p);
    };

    // ---- 1. webhook security
    console.log('\n# Webhook security');
    const forged = await webhook('payment.completed', { reference: 'x' }, { secret: 'wrong' });
    check('wrong signature rejected (401)', forged.status === 401, forged);
    const stale = await webhook('payment.completed', { reference: 'x' }, { ts: Math.floor(Date.now() / 1000) - 3600 });
    check('stale timestamp rejected (401)', stale.status === 401, stale);
    const unsigned = await fetch(`${API}/v1/webhooks/snippe`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"type":"payment.completed","data":{"reference":"x"}}' });
    check('unsigned webhook rejected (401)', unsigned.status === 401);

    // ---- 2. collection
    console.log('\n# Collection (USSD push)');
    const tooSmall = await pay(100);
    check('amount below 500 TZS rejected (400)', tooSmall.status === 400, tooSmall);
    const p1 = await pay(20000);
    check('payment initiated (201)', p1.status === 201 && p1.json.paymentId, p1);
    const create = calls.find((c) => c.method === 'POST' && c.path === '/v1/payments');
    check('Idempotency-Key sent and <= 30 chars', !!create && String(create.headers['idempotency-key']).length <= 30 && String(create.headers['idempotency-key']).length > 0, create?.headers['idempotency-key']);
    check('phone normalised to 255…', create?.body.phone_number === '255755111222', create?.body.phone_number);
    check('payment_type=mobile, TZS integer amount', create?.body.payment_type === 'mobile' && create?.body.details.amount === 20000 && create?.body.details.currency === 'TZS');
    check('customer name split + email supplied', create?.body.customer.firstname === 'Asha' && create?.body.customer.lastname === 'Juma Mwinyi' && /@/.test(create?.body.customer.email));
    check('no webhook_url on non-https base', create?.body.webhook_url === undefined);
    const row1 = await db.payment.findUnique({ where: { id: p1.json.paymentId } });
    check('payment PENDING with Snippe ref stored', row1?.status === 'PENDING' && row1?.providerRef === 'pay-1' && row1?.provider === 'SNIPPE', row1);

    // ---- 3. confirmation -> allocation -> first payout (below minimum)
    console.log('\n# Confirmation + disbursement');
    const w1 = await complete('pay-1', 20000, 19500);
    check('signed payment.completed accepted', w1.status === 200 && w1.json.result === 'applied', w1);
    const row1b = await db.payment.findUnique({ where: { id: p1.json.paymentId } });
    check('payment CONFIRMED, net 19500 / fee 500, method from channel', row1b?.status === 'CONFIRMED' && Number(row1b.netAmount) === 19500 && Number(row1b.feeAmount) === 500 && row1b.method === 'AIRTELMONEY', row1b);
    const inst1 = await db.installment.findFirst({ where: { loanId: loan.id, sequence: 1 } });
    check('instalment credited 20000', Number(inst1?.amountPaid) === 20000, inst1);

    const po = await until(async () => (await db.payout.findFirst({ where: { tenantId } })) ?? null);
    check('payout created automatically', !!po);
    const send = calls.find((c) => c.path === '/v1/payouts/send');
    check('payout amount = net - fee (19500-500=19000)', send?.body.amount === 19000, send?.body);
    check('payout to seller mobile, normalised', send?.body.channel === 'mobile' && send?.body.recipient_phone === '255712345678' && send?.body.recipient_name === 'Shop Owner', send?.body);
    check('payout carries Idempotency-Key', !!send?.headers['idempotency-key']);
    const poRow = await db.payout.findFirst({ where: { tenantId }, include: { payments: true } });
    check('payout PENDING, linked to payment, ref stored', poRow?.status === 'PENDING' && poRow.providerRef === 'po-1' && poRow.payments.length === 1 && Number(poRow.amount) === 19000 && Number(poRow.grossAmount) === 19500, poRow);

    // replayed payment webhook must not double-pay
    const replay = await complete('pay-1', 20000, 19500);
    check('replayed payment webhook is a duplicate', replay.json.result === 'duplicate', replay);
    await sleep(500);
    check('replay did not create a second payout', (await db.payout.count({ where: { tenantId } })) === 1);

    // payout webhook
    payouts.get('po-1').status = 'completed';
    const pw = await webhook('payout.completed', { reference: 'po-1' });
    check('payout.completed applied', pw.json.result === 'applied', pw);
    const poDone = await db.payout.findFirst({ where: { tenantId } });
    check('payout COMPLETED', poDone?.status === 'COMPLETED' && !!poDone.completedAt, poDone);

    // ---- 4. below-minimum accumulation
    console.log('\n# Small payments accumulate until payout minimum');
    const p2 = await pay(3000);
    await complete('pay-2', 3000, 2900);
    await sleep(800);
    check('2,900 owed is below minimum -> no payout yet', (await db.payout.count({ where: { tenantId } })) === 1);
    await pay(10000);
    await complete('pay-3', 10000, 9800);
    const po2 = await until(async () => ((await db.payout.count({ where: { tenantId } })) === 2 ? await db.payout.findFirst({ where: { tenantId }, orderBy: { createdAt: 'desc' }, include: { payments: true } }) : null));
    check('accumulated 12,700 paid out as 12,200 (fee deducted)', !!po2 && Number(po2.amount) === 12200 && po2.payments.length === 2, po2);

    // ---- 5. failure path releases funds
    console.log('\n# Failed payout releases payments for retry');
    payouts.get('po-2').status = 'failed';
    payouts.get('po-2').failure_reason = 'Recipient wallet invalid';
    const wf = await webhook('payout.failed', { reference: 'po-2' });
    check('payout.failed applied', wf.json.result === 'applied', wf);
    const failed = await db.payout.findFirst({ where: { id: po2!.id }, include: { payments: true } });
    check('payout FAILED with reason, payments released', failed?.status === 'FAILED' && /invalid/.test(failed.failureReason ?? '') && failed.payments.length === 0, failed);
    const late = await webhook('payout.completed', { reference: 'po-2' });
    payouts.get('po-2').status = 'completed';
    await webhook('payout.completed', { reference: 'po-2' });
    check('late "completed" cannot resurrect a failed payout', (await db.payout.findUnique({ where: { id: po2!.id } }))?.status === 'FAILED', late);

    // ---- 6. definitive rejection (insufficient balance) frees funds, no double pay
    console.log('\n# Insufficient gateway balance');
    const admin = (await (await fetch(`${API}/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@linda.co.tz', password: 'Linda@2026' }) })).json()) as any;
    const adminAuth = { authorization: `Bearer ${admin.accessToken}` };
    nextPayoutFails = 'insufficient balance: available 0, required 12700';
    const r = await fetch(`${API}/v1/payouts/tenants/${tenantId}/disburse`, { method: 'POST', headers: adminAuth });
    check('super-admin disburse endpoint works', r.ok, await r.text());
    const rej = await db.payout.findFirst({ where: { tenantId }, orderBy: { createdAt: 'desc' }, include: { payments: true } });
    check('rejected payout FAILED and payments back in owed pool', rej?.status === 'FAILED' && rej.payments.length === 0 && /insufficient/.test(rej.failureReason ?? ''), rej);
    const retry = await fetch(`${API}/v1/payouts/tenants/${tenantId}/disburse`, { method: 'POST', headers: adminAuth });
    const retryJson = (await retry.json()) as any;
    const retried = await db.payout.findFirst({ where: { id: retryJson.payoutId }, include: { payments: true } });
    check('retry after top-up succeeds with the same 2 payments, paid once', !!retried && retried.status === 'PENDING' && retried.payments.length === 2 && Number(retried.amount) === 12200, retried);

    // ---- 7. tenant without payout account
    console.log('\n# Seller without payout account');
    const loanNA = await (async () => {
      const c = await db.customer.create({ data: { tenantId: noAcct.id, fullName: 'X Y', phone: '255700000002' } });
      const d = await db.device.create({ data: { tenantId: noAcct.id, customerId: c.id, imei: `na-${suffix}`, status: 'ACTIVE' } });
      return db.loan.create({ data: { tenantId: noAcct.id, customerId: c.id, deviceId: d.id, principal: 100000, termMonths: 1, termPeriods: 1 } });
    })();
    await db.payment.create({ data: { tenantId: noAcct.id, loanId: loanNA.id, amount: 50000, method: 'MPESA', status: 'CONFIRMED', provider: 'SNIPPE', netAmount: 49000 } });
    const na = await fetch(`${API}/v1/payouts/tenants/${noAcct.id}/disburse`, { method: 'POST', headers: adminAuth });
    check('no payout sent for tenant lacking a payout account', ((await na.json()) as any).skipped === 'no_payout_account' && (await db.payout.count({ where: { tenantId: noAcct.id } })) === 0);

    // ---- 8. payout account: owner self-service with safeguards
    console.log('\n# Payout account changes');
    await db.user.create({ data: { tenantId, email: `m-${suffix}@t.test`, fullName: 'Manager', role: 'MANAGER', passwordHash: await argon2.hash('pw12345678', { type: argon2.argon2id }) } });
    const mgr = (await (await fetch(`${API}/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `m-${suffix}@t.test`, password: 'pw12345678' }) })).json()) as any;
    const put = (path: string, headers: any, body: any) => fetch(`${API}/v1/payouts/${path}`, { method: 'PUT', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
    const good = { phone: '0755000222', name: 'New Owner Name' };

    check('manager cannot change the account (403)', (await put('account', { authorization: `Bearer ${mgr.accessToken}` }, { ...good, password: 'pw12345678' })).status === 403);
    check('owner without password rejected (400)', (await put('account', auth, good)).status === 400);
    check('invalid phone rejected (400)', (await put('account', auth, { ...good, phone: '12345', password: 'pw12345678' })).status === 400);
    check('wrong password rejected (401)', (await put('account', auth, { ...good, password: 'nope' })).status === 401);
    check('wrong password changed nothing', (await db.tenant.findUnique({ where: { id: tenantId } }))?.payoutPhone === '0712345678');

    const changed = await put('account', auth, { ...good, password: 'pw12345678' });
    const cj = (await changed.json()) as any;
    check('owner with correct password can change (200)', changed.status === 200, cj);
    const t1 = await db.tenant.findUnique({ where: { id: tenantId } });
    check('number stored normalised (255…) and name saved', t1?.payoutPhone === '255755000222' && t1?.payoutName === 'New Owner Name', t1);
    const hoursLeft = t1?.payoutHoldUntil ? (t1.payoutHoldUntil.getTime() - Date.now()) / 3600e3 : 0;
    check('payouts paused ~24h after the number changed', hoursLeft > 23 && hoursLeft <= 24, hoursLeft);
    check('summary exposes the hold', !!cj.holdUntil, cj.holdUntil);
    const hist = await db.payoutAccountChange.findMany({ where: { tenantId } });
    check('change recorded: who, old -> new', hist.length === 1 && hist[0].changedByRole === 'OWNER' && hist[0].oldPhone === '255712345678' && hist[0].newPhone === '255755000222', hist);

    // money owed now must wait out the hold
    await db.payment.create({ data: { tenantId, loanId: loan.id, amount: 21000, method: 'MPESA', status: 'CONFIRMED', provider: 'SNIPPE', netAmount: 20000 } });
    const sendsBefore = calls.filter((c) => c.path === '/v1/payouts/send').length;
    const held = (await (await fetch(`${API}/v1/payouts/tenants/${tenantId}/disburse`, { method: 'POST', headers: adminAuth })).json()) as any;
    check('disbursement skipped while account is on hold', held.skipped === 'account_on_hold', held);
    check('nothing sent to Snippe during the hold', calls.filter((c) => c.path === '/v1/payouts/send').length === sendsBefore);

    // hold lapses -> money goes to the NEW number
    await db.tenant.update({ where: { id: tenantId }, data: { payoutHoldUntil: new Date(Date.now() - 1000) } });
    const released = (await (await fetch(`${API}/v1/payouts/tenants/${tenantId}/disburse`, { method: 'POST', headers: adminAuth })).json()) as any;
    const lastSend = calls.filter((c) => c.path === '/v1/payouts/send').pop();
    check('after the hold, payout goes to the new number and name', !!released.payoutId && lastSend?.body.recipient_phone === '255755000222' && lastSend?.body.recipient_name === 'New Owner Name', lastSend?.body);

    // admin fix: audited, no new hold
    const adm = await put(`tenants/${tenantId}/account`, adminAuth, { phone: '0689111333', name: 'Fixed By Admin' });
    const t2 = await db.tenant.findUnique({ where: { id: tenantId } });
    check('super admin can set the account (no hold, audited)', adm.status === 200 && t2?.payoutPhone === '255689111333' && t2.payoutHoldUntil === null && (await db.payoutAccountChange.count({ where: { tenantId } })) === 2);
    check('owner cannot use the admin endpoint (403)', (await put(`tenants/${tenantId}/account`, auth, good)).status === 403);

    // brute-force lockout
    let last = 0;
    for (let i = 0; i < 6; i++) last = (await put('account', auth, { ...good, password: `bad${i}` })).status;
    check('repeated wrong passwords get locked out (429)', last === 429, last);

    // ---- 2b. customer declines the prompt; duplicate requests
    console.log('\n# Cancelled prompts and duplicate requests');
    const pc = await pay(7000);
    const pcRow = await db.payment.findUnique({ where: { id: pc.json.paymentId } });
    const cancelledRef = pcRow!.providerRef!;
    payments.get(cancelledRef).status = 'cancelled';
    const wc = await webhook('payment.cancelled', payments.get(cancelledRef));
    check('payment.cancelled webhook accepted', wc.status === 200 && wc.json.result === 'failed', wc);
    check('cancelled payment is closed as FAILED (not stuck PENDING)', (await db.payment.findUnique({ where: { id: pc.json.paymentId } }))?.status === 'FAILED');

    const pdup = await pay(8000);
    const pdupRef = (await db.payment.findUnique({ where: { id: pdup.json.paymentId } }))!.providerRef!;
    reuseRefNext = pdupRef;
    const dup = await pay(8000);
    check('repeat request answered with an existing reference -> clear 409, not a server error', dup.status === 409 && /already waiting/.test(JSON.stringify(dup.json)), dup);
    const dupRows = await db.payment.findMany({ where: { loanId: loan.id, amount: 8000 }, orderBy: { createdAt: 'asc' } });
    check('original keeps its reference; the duplicate attempt is closed', dupRows.length === 2 && dupRows[0].providerRef === pdupRef && dupRows[0].status === 'PENDING' && dupRows[1].status === 'FAILED' && dupRows[1].providerRef === null, dupRows.map((r) => [r.status, r.providerRef]));
    payments.get(pdupRef).status = 'expired';
    await webhook('payment.expired', payments.get(pdupRef));

    // ---- 9. cash is never disbursed
    console.log('\n# Cash payments');
    const before = await db.payout.count({ where: { tenantId } });
    await fetch(`${API}/v1/payments`, { method: 'POST', headers: auth, body: JSON.stringify({ loanId: loan.id, amount: 50000 }) });
    await sleep(600);
    check('manual cash payment not routed to payouts', (await db.payout.count({ where: { tenantId } })) === before);
  } finally {
    if (tenantId) await db.tenant.deleteMany({ where: { name: { contains: suffix } } }).catch(() => null);
    child.kill();
    fake.close();
    await db.$disconnect();
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
