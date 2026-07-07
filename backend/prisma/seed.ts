/**
 * Seed two tenants, one device each, and login-able users for manual testing.
 * Runs as the superuser (DATABASE_URL) so it can write across tenants.
 *
 *   super@devicelock.test / password123   -> SUPER_ADMIN (no tenant)
 *   owner.a@acme.test     / password123   -> OWNER of Tenant A
 */
import { PrismaClient, UserRole } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();
const hash = (p: string) => argon2.hash(p, { type: argon2.argon2id });

async function main() {
  const a = await prisma.tenant.upsert({
    where: { id: 'seed-tenant-a' },
    update: {},
    create: { id: 'seed-tenant-a', name: 'Tenant A — Acme Phones' },
  });
  const b = await prisma.tenant.upsert({
    where: { id: 'seed-tenant-b' },
    update: {},
    create: { id: 'seed-tenant-b', name: 'Tenant B — Bongo Mobiles' },
  });

  await prisma.device.upsert({
    where: { id: 'seed-device-a' },
    update: {},
    create: { id: 'seed-device-a', tenantId: a.id, imei: 'AAAA-0001' },
  });
  await prisma.device.upsert({
    where: { id: 'seed-device-b' },
    update: {},
    create: { id: 'seed-device-b', tenantId: b.id, imei: 'BBBB-0001' },
  });

  const pw = await hash('password123');
  await prisma.user.upsert({
    where: { email: 'super@devicelock.test' },
    update: {},
    create: {
      email: 'super@devicelock.test',
      fullName: 'Platform Admin',
      role: UserRole.SUPER_ADMIN,
      passwordHash: pw,
      tenantId: null,
    },
  });
  await prisma.user.upsert({
    where: { email: 'owner.a@acme.test' },
    update: {},
    create: {
      email: 'owner.a@acme.test',
      fullName: 'Acme Owner',
      role: UserRole.OWNER,
      passwordHash: pw,
      tenantId: a.id,
    },
  });

  console.log('Seeded tenants A & B, devices, and users.');
  console.log('  super@devicelock.test / password123 (SUPER_ADMIN)');
  console.log('  owner.a@acme.test     / password123 (OWNER, Tenant A)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
