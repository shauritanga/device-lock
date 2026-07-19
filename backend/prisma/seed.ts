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

  console.log('Cleaned app data and created platform admin.');
  console.log('  athanas@devicelock.test / Athanas@2015 (SUPER_ADMIN)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
