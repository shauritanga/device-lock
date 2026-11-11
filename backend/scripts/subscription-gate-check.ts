/**
 * Checks the "pay your package first" gate and the Negotiation package against
 * a built backend and a THROWAWAY database. No external services are called.
 *
 *   npm run build
 *   TEST_DATABASE_URL=<throwaway db, name contains "test"> npm run test:gate
 */
import { spawn } from 'child_process';
import * as argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';

const DB_URL = process.env.TEST_DATABASE_URL;
if (!DB_URL || !/test/i.test(DB_URL)) {
  console.error('Set TEST_DATABASE_URL to a throwaway database (name must contain "test")');
  process.exit(2);
}
const PORT = 3198;
const API = `http://localhost:${PORT}/v1`;

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  console.log(`${cond ? '✅ PASS' : '❌ FAIL'}  ${name}${!cond && extra !== undefined ? '  -> ' + JSON.stringify(extra) : ''}`);
  cond ? pass++ : fail++;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const db = new PrismaClient({ datasources: { db: { url: DB_URL } } });
  const childEnv: NodeJS.ProcessEnv = { ...process.env };
  delete childEnv.RLS_DATABASE_URL;
  const child = spawn('node', ['dist/main.js'], {
    env: { ...childEnv, DATABASE_URL: DB_URL, PORT: String(PORT), NODE_ENV: 'development', SNIPPE_API_KEY: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (d) => (log += d));
  child.stderr.on('data', (d) => (log += d));

  const suffix = Date.now().toString(36);
  const names: string[] = [];
  try {
    for (let i = 0; i < 60; i++) {
      if (await fetch(`${API}/auth/login`, { method: 'POST' }).then(() => true).catch(() => false)) break;
      await sleep(500);
      if (i === 59) throw new Error('backend did not start:\n' + log.slice(-1500));
    }
    const hash = (p: string) => argon2.hash(p, { type: argon2.argon2id });
    const login = async (email: string, password: string) =>
      ((await (await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) })).json()) as any).accessToken as string;
    const call = async (method: string, path: string, token: string, body?: unknown) => {
      const r = await fetch(`${API}${path}`, { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
      return { status: r.status, json: (await r.json().catch(() => ({}))) as any };
    };

    await db.user.upsert({ where: { email: 'admin@linda.co.tz' }, update: {}, create: { email: 'admin@linda.co.tz', fullName: 'Admin', role: 'SUPER_ADMIN', passwordHash: await hash('Linda@2026') } });
    const admin = await login('admin@linda.co.tz', 'Linda@2026');

    // A company created the normal way: must pay first.
    const mkCompany = async (label: string, extra: Record<string, unknown> = {}) => {
      const name = `${label}-${suffix}`;
      names.push(name);
      const t = await db.tenant.create({ data: { name, ...extra } });
      const email = `o-${label}-${suffix}@t.test`;
      await db.user.create({ data: { tenantId: t.id, email, fullName: 'Owner', role: 'OWNER', passwordHash: await hash('pw12345678') } });
      return { tenant: t, owner: await login(email, 'pw12345678') };
    };
    const registerPhone = (token: string, n: number) => call('POST', '/devices', token, { imei: `35${suffix}${n}`.padEnd(15, '0'), make: 'Test' });

    // ---- 1. a brand-new company is read-only
    console.log('\n# New company must pay before working');
    const a = await mkCompany('phones');
    check('new companies require a paid subscription by default', a.tenant.subscriptionRequired === true);
    let acc = await call('GET', '/subscription/access', a.owner);
    check('access: not allowed, no package yet', acc.json.allowed === false && acc.json.reason === 'NO_SUBSCRIPTION', acc.json);
    const denied = await registerPhone(a.owner, 1);
    check('cannot register a phone (403 SUBSCRIPTION_REQUIRED)', denied.status === 403 && denied.json.code === 'SUBSCRIPTION_REQUIRED', denied);
    check('cannot add a customer either', (await call('POST', '/customers', a.owner, { fullName: 'X Y', phone: '255700000001' })).status === 403);
    check('can still read their data (GET /devices)', (await call('GET', '/devices', a.owner)).status === 200);
    check('can still sign in', !!(await login(`o-phones-${suffix}@t.test`, 'pw12345678')));

    // ---- 2. Starter: prepay a set number of phones
    console.log('\n# Starter: pay up front for a set number of phones');
    const noQty = await call('POST', '/collections/subscriptions/activate', admin, { tenantId: a.tenant.id, packageCode: 'STARTER' });
    check('activating Starter requires a phone count (400)', noQty.status === 400, noQty.json);
    const tooMany = await call('POST', '/collections/subscriptions/activate', admin, { tenantId: a.tenant.id, packageCode: 'STARTER', phoneAllowance: 40 });
    check('Starter cannot exceed its band of 39 (400)', tooMany.status === 400);
    const act = await call('POST', '/collections/subscriptions/activate', admin, { tenantId: a.tenant.id, packageCode: 'STARTER', phoneAllowance: 2 });
    check('Starter activates for 2 phones with no phones registered yet', act.status === 201 || act.status === 200, act.json);
    const inv = await db.collectionsInvoice.findFirst({ where: { tenantId: a.tenant.id } });
    check('first invoice created automatically: 2 x 18,000 = 36,000', !!inv && Number(inv.total) === 36000, inv);
    acc = await call('GET', '/subscription/access', a.owner);
    check('still locked until the first invoice is paid', acc.json.allowed === false && acc.json.reason === 'AWAITING_FIRST_PAYMENT' && acc.json.invoice?.total === 36000, acc.json);
    check('registering a phone is still blocked', (await registerPhone(a.owner, 2)).status === 403);

    // ---- 3. paying unlocks, and the phone limit applies
    console.log('\n# Paying unlocks; the paid-for phone limit applies');
    const paid = await call('POST', `/collections/invoices/${inv!.id}/mark-paid`, admin, {});
    check('admin marks the invoice paid', paid.status === 201 || paid.status === 200, paid.json);
    acc = await call('GET', '/subscription/access', a.owner);
    check('company is unlocked straight away', acc.json.allowed === true && acc.json.reason === 'OK', acc.json);
    const p1 = await registerPhone(a.owner, 3);
    const p2 = await registerPhone(a.owner, 4);
    check('can register the 2 phones they paid for', p1.status === 201 && p2.status === 201, [p1.status, p2.status, p1.json]);
    const p3 = await registerPhone(a.owner, 5);
    check('a 3rd phone is refused (PHONE_LIMIT_REACHED)', p3.status === 403 && p3.json.code === 'PHONE_LIMIT_REACHED', p3);

    // ---- 4. renewals: grace period, then read-only again
    console.log('\n# Renewals: grace period, then read-only again');
    const day = 86400e3;
    const renewal = await db.collectionsInvoice.create({ data: { tenantId: a.tenant.id, subscriptionId: inv!.subscriptionId, periodStart: new Date(Date.now() - 40 * day), periodEnd: new Date(Date.now() - 10 * day), packageCode: 'STARTER', activeDevices: 2, priceModel: 'PER_DEVICE', currency: 'TZS', subtotal: 36000, total: 36000, status: 'OPEN', lineItems: [], dueDate: new Date(Date.now() - 3 * day) } });
    await call('PATCH', `/tenants/${a.tenant.id}`, admin, { isActive: true }); // clears the short cache
    acc = await call('GET', '/subscription/access', a.owner);
    check('unpaid renewal 3 days late is inside the 7-day grace: still allowed', acc.json.allowed === true, acc.json);
    await db.collectionsInvoice.update({ where: { id: renewal.id }, data: { dueDate: new Date(Date.now() - 10 * day) } });
    await call('PATCH', `/tenants/${a.tenant.id}`, admin, { isActive: true });
    acc = await call('GET', '/subscription/access', a.owner);
    check('10 days late: read-only again (PAYMENT_OVERDUE)', acc.json.allowed === false && acc.json.reason === 'PAYMENT_OVERDUE', acc.json);
    check('writes are blocked again', (await call('POST', '/customers', a.owner, { fullName: 'X Y', phone: '255700000009' })).status === 403);
    await call('POST', `/collections/invoices/${renewal.id}/mark-paid`, admin, {});
    acc = await call('GET', '/subscription/access', a.owner);
    check('paying the renewal unlocks again', acc.json.allowed === true, acc.json);

    // ---- 5. Negotiation package
    console.log('\n# Negotiation package (no phones, agreed price)');
    const n = await mkCompany('micro');
    const noPrice = await call('POST', '/collections/subscriptions/activate', admin, { tenantId: n.tenant.id, packageCode: 'NEGOTIATION' });
    check('Negotiation needs an agreed monthly fee (400)', noPrice.status === 400, noPrice.json);
    const nAct = await call('POST', '/collections/subscriptions/activate', admin, { tenantId: n.tenant.id, packageCode: 'NEGOTIATION', agreedMonthlyPrice: 250000 });
    check('Negotiation activates with an agreed fee', nAct.status === 201 || nAct.status === 200, nAct.json);
    const nInv = await db.collectionsInvoice.findFirst({ where: { tenantId: n.tenant.id } });
    check('first invoice is the agreed fee: 250,000', !!nInv && Number(nInv.total) === 250000, nInv);
    acc = await call('GET', '/subscription/access', n.owner);
    check('locked until paid, and flagged as no-phones', acc.json.allowed === false && acc.json.noPhones === true, acc.json);
    await call('POST', `/collections/invoices/${nInv!.id}/mark-paid`, admin, {});
    acc = await call('GET', '/subscription/access', n.owner);
    check('unlocked once paid', acc.json.allowed === true, acc.json);
    const nPhone = await registerPhone(n.owner, 6);
    check('but still cannot register phones (NEGOTIATION_NO_PHONES)', nPhone.status === 403 && nPhone.json.code === 'NEGOTIATION_NO_PHONES', nPhone);
    check('nor create loans', (await call('POST', '/loans', n.owner, {})).status === 403);
    const withPhones = await mkCompany('hasphones');
    await db.device.create({ data: { tenantId: withPhones.tenant.id, imei: `hp${suffix}`, status: 'ACTIVE' } });
    const wp = await call('POST', '/collections/subscriptions/activate', admin, { tenantId: withPhones.tenant.id, packageCode: 'NEGOTIATION', agreedMonthlyPrice: 100000 });
    check('a company that already has phones cannot take Negotiation (400)', wp.status === 400, wp.json);

    // ---- 6. exempt companies and the admin switch
    console.log('\n# Existing companies are exempt; admin can switch the rule on');
    const e = await mkCompany('legacy', { subscriptionRequired: false });
    check('exempt company can work with no package', (await call('POST', '/customers', e.owner, { fullName: 'Ana Lee', phone: '255700000010', nationalId: 'NID12345678', idDocumentType: 'NATIONAL_ID', address: 'Dar es Salaam' })).status === 201);
    acc = await call('GET', '/subscription/access', e.owner);
    check('access reports EXEMPT', acc.json.allowed === true && acc.json.reason === 'EXEMPT', acc.json);
    const sw = await call('PATCH', `/tenants/${e.tenant.id}`, admin, { subscriptionRequired: true });
    check('admin switches the rule on', sw.status === 200 && sw.json.subscriptionRequired === true, sw.json);
    check('that company is now blocked', (await call('POST', '/customers', e.owner, { fullName: 'Bo Kay', phone: '255700000011' })).status === 403);
    check('owner cannot switch the rule off (403)', (await call('PATCH', `/tenants/${e.tenant.id}`, e.owner, { subscriptionRequired: false })).status === 403);
  } finally {
    await db.tenant.deleteMany({ where: { name: { contains: suffix } } }).catch(() => null);
    child.kill();
    await db.$disconnect();
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
