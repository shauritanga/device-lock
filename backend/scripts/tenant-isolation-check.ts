/**
 * Proves tenant isolation works at BOTH layers. Run after `npm run db:seed`.
 *
 *   Layer 1 (Postgres RLS): connect as the non-superuser `devicelock_app`.
 *           Without a tenant GUC -> 0 rows; with it -> only that tenant's rows.
 *   Layer 2 (Prisma extension): connect as superuser (RLS bypassed) so ONLY the
 *           app-layer extension does the filtering.
 */
import { PrismaClient } from '@prisma/client';
import { extendWithTenantScope } from '../src/common/prisma/prisma.service';

const APP_URL = process.env.RLS_DATABASE_URL!; // devicelock_app — RLS enforced
const ADMIN_URL = process.env.DATABASE_URL!; // superuser — RLS bypassed

// Minimal stand-in for ClsService that the extension reads.
function fakeCls(tenantId?: string) {
  return { getId: () => 'test', get: (_k: string) => tenantId } as any;
}

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean) {
  console.log(`${cond ? '✅ PASS' : '❌ FAIL'}  ${name}`);
  cond ? pass++ : fail++;
}

async function main() {
  // ---------- Layer 1: Postgres RLS ----------
  const appDb = new PrismaClient({ datasources: { db: { url: APP_URL } } });

  const noCtx = await appDb.device.count();
  check('RLS: no tenant context returns 0 rows (default deny)', noCtx === 0);

  const aRows = await appDb.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = 'seed-tenant-a'`);
    return tx.device.findMany();
  });
  check(
    'RLS: tenant A sees only its own device',
    aRows.length === 1 && aRows[0].imei === 'AAAA-0001',
  );

  const bRows = await appDb.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = 'seed-tenant-b'`);
    return tx.device.findMany();
  });
  check(
    'RLS: tenant B sees only its own device',
    bRows.length === 1 && bRows[0].imei === 'BBBB-0001',
  );

  await appDb.$disconnect();

  // ---------- Layer 2: Prisma tenant-scope extension ----------
  const base = new PrismaClient({ datasources: { db: { url: ADMIN_URL } } });

  const scopedA = extendWithTenantScope(base, fakeCls('seed-tenant-a'));
  const extA = await scopedA.device.findMany();
  check(
    'Extension: cls=A returns only A',
    extA.length === 1 && extA[0].imei === 'AAAA-0001',
  );

  const scopedNone = extendWithTenantScope(base, fakeCls(undefined));
  const extAll = await scopedNone.device.findMany();
  check('Extension: no tenant (super-admin) sees all tenants', extAll.length >= 2);

  await base.$disconnect();

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
