/**
 * Clean local app data and create the platform admin user.
 *
 *   admin@linda.co.tz / Linda@2026 -> SUPER_ADMIN
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
      "DemoRequest",
      "User",
      "Tenant"
    RESTART IDENTITY CASCADE
  `);

  const pw = await hash('Linda@2026');
  await prisma.user.create({
    data: {
      email: 'admin@linda.co.tz',
      fullName: 'Abdulmalik Hashim',
      role: UserRole.SUPER_ADMIN,
      passwordHash: pw,
      tenantId: null,
      phone: '+255692251043',
    },
  });

  console.log('Cleaned app data and created platform admin.');
  console.log('  admin@linda.co.tz / Linda@2026 (SUPER_ADMIN)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
