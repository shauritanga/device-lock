/**
 * Clean local app data and create the platform admin user.
 *
 *   athanas@devicelock.test / Athanas@2015 -> SUPER_ADMIN
 */
import { PrismaClient, UserRole } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();
const hash = (p: string) => argon2.hash(p, { type: argon2.argon2id });

async function main() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "RefreshToken",
      "BillingInvoice",
      "CallAttempt",
      "CallFollowUp",
      "CollectionsInvoice",
      "CollectorDailyStat",
      "CollectorWorkSession",
      "CommunicationLog",
      "ContactSession",
      "PromiseToPay",
      "CollectionCase",
      "CollectionsSubscription",
      "Contract",
      "Payment",
      "Installment",
      "DeviceCommand",
      "DeviceEvent",
      "EnrollmentToken",
      "Loan",
      "Device",
      "Customer",
      "User",
      "Tenant"
    RESTART IDENTITY CASCADE
  `);

  const pw = await hash('Athanas@2015');
  await prisma.user.create({
    data: {
      email: 'athanas@devicelock.test',
      fullName: 'Athanas Shauritanga',
      role: UserRole.SUPER_ADMIN,
      passwordHash: pw,
      tenantId: null,
    },
  });

  const collectorPw = await hash('Collector@2026');
  await prisma.user.create({
    data: {
      email: 'collector@devicelock.test',
      fullName: 'Demo Collector',
      role: UserRole.COLLECTOR,
      passwordHash: collectorPw,
      tenantId: null,
      phone: '+255700000001',
    },
  });
  await prisma.user.create({
    data: {
      email: 'collections.admin@devicelock.test',
      fullName: 'Collections Admin',
      role: UserRole.COLLECTIONS_ADMIN,
      passwordHash: collectorPw,
      tenantId: null,
      phone: '+255700000002',
    },
  });

  console.log('Cleaned app data and created platform admin + collections staff.');
  console.log('  athanas@devicelock.test / Athanas@2015 (SUPER_ADMIN)');
  console.log('  collections.admin@devicelock.test / Collector@2026 (COLLECTIONS_ADMIN)');
  console.log('  collector@devicelock.test / Collector@2026 (COLLECTOR)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
