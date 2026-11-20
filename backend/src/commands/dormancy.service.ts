import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ClsService } from 'nestjs-cls';
import {
  AfterRepayment,
  CommandStatus,
  CommandType,
  DeviceStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { TENANT_ID_KEY } from '../common/tenant/tenant-context';
import { CollectionsService } from '../collections/collections.service';
import { CommandsService } from './commands.service';

/** The first app build that understands RELAX and ARM. Older phones can only be released. */
const MIN_DORMANT_VERSION = [0, 6, 0];

export function supportsDormant(agentVersion?: string | null): boolean {
  if (!agentVersion) return false;
  const parts = agentVersion.split('.').map((p) => parseInt(p, 10));
  for (let i = 0; i < 3; i++) {
    const have = Number.isFinite(parts[i]) ? parts[i] : 0;
    if (have !== MIN_DORMANT_VERSION[i]) return have > MIN_DORMANT_VERSION[i];
  }
  return true;
}

/**
 * Repeat lending. When a loan is repaid and the lender keeps phones enrolled, the phone is
 * not released: it is unlocked and unrestricted ("dormant") and waits for the same
 * customer's next loan, so nobody has to factory-reset it.
 *
 * The data model allows one loan per phone, so the finished loan stays with an archived
 * copy of the phone record, and the live record (which owns the agent's credentials) moves
 * to a fresh row with no loan. History is kept and nothing else has to change.
 */
@Injectable()
export class DormancyService {
  private readonly logger = new Logger(DormancyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly commands: CommandsService,
    private readonly collections: CollectionsService,
    private readonly cls: ClsService,
  ) {}

  /** True when this loan's phone should go dormant instead of being released. */
  async shouldKeepEnrolled(tenantId: string, agentVersion?: string | null) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { afterRepayment: true },
    });
    return tenant?.afterRepayment === AfterRepayment.KEEP_ENROLLED && supportsDormant(agentVersion);
  }

  /** Move the phone to a fresh, loan-free record and tell it to relax. Returns the new device id. */
  async enter(loanId: string): Promise<string | null> {
    const loan = await this.prisma.scoped.loan.findFirst({
      where: { id: loanId },
      select: { id: true, deviceId: true, customerId: true },
    });
    if (!loan) return null;
    const old = await this.prisma.scoped.device.findFirst({ where: { id: loan.deviceId } });
    if (!old || old.archivedAt || !old.agentTokenHash) return null;
    if (old.status !== DeviceStatus.ACTIVE && old.status !== DeviceStatus.LOCKED) return null;

    const now = new Date();
    const fresh = await this.prisma.scoped.$transaction(async (tx) => {
      // The unique fields move to the new row, so the old row gives them up first.
      await tx.device.update({
        where: { id: old.id },
        data: {
          imei: `${old.imei}~${old.id.slice(0, 8)}`,
          agentTokenHash: null,
          smsSecret: null,
          fcmToken: null,
          externalId: null,
          status: DeviceStatus.RELEASED,
          archivedAt: now,
        },
      });
      const { id: _id, createdAt: _c, updatedAt: _u, ...keep } = old;
      void _id; void _c; void _u;
      const created = await tx.device.create({
        data: {
          ...keep,
          status: DeviceStatus.ACTIVE,
          archivedAt: null,
          lockedAt: null,
          dormantSince: now,
          customerId: loan.customerId,
        } as Prisma.DeviceUncheckedCreateInput,
      });
      // Anything still waiting for the old record is moot now.
      await tx.deviceCommand.updateMany({
        where: {
          deviceId: old.id,
          status: { in: [CommandStatus.QUEUED, CommandStatus.SENT] },
        },
        data: { status: CommandStatus.EXPIRED },
      });
      await tx.deviceEvent.create({
        data: { tenantId: old.tenantId, deviceId: old.id, type: 'ROLLED_OVER', metadata: { toDeviceId: created.id } },
      });
      await tx.deviceEvent.create({
        data: {
          tenantId: old.tenantId,
          deviceId: created.id,
          type: 'HELD_FOR_REPEAT_LENDING',
          metadata: { fromDeviceId: old.id, loanId },
        },
      });
      return created;
    });

    // The finished loan's case closes with the archived record.
    await this.collections.onDeviceReleased(old.id).catch(() => undefined);
    await this.commands.queue(fresh.id, CommandType.RELAX, {
      reason: 'loan repaid: phone stays enrolled, unrestricted',
    });
    this.logger.log(`Phone ${old.id} repaid; now held for repeat lending as ${fresh.id}`);
    return fresh.id;
  }

  /** A new loan starts on a held phone: lift the dormant mark and arm the restrictions again. */
  async wake(deviceId: string) {
    await this.prisma.scoped.device.update({ where: { id: deviceId }, data: { dormantSince: null } });
    await this.commands.queue(deviceId, CommandType.ARM, { reason: 'new loan started' });
  }

  /** Phones held for repeat lending that no one borrowed against in time go back to the customer. */
  @Cron('30 3 * * *')
  async releaseExpired() {
    const held = await this.prisma.device.findMany({
      where: {
        dormantSince: { not: null },
        archivedAt: null,
        status: DeviceStatus.ACTIVE,
        loan: { is: null },
      },
      select: {
        id: true,
        tenantId: true,
        dormantSince: true,
        tenant: { select: { retentionDays: true } },
      },
    });
    let released = 0;
    for (const d of held) {
      const limit = Date.now() - d.tenant.retentionDays * 86_400_000;
      if (!d.dormantSince || d.dormantSince.getTime() > limit) continue;
      await this.cls.run(async () => {
        this.cls.set(TENANT_ID_KEY, d.tenantId);
        await this.prisma.scoped.device.update({ where: { id: d.id }, data: { dormantSince: null } });
        await this.commands.queue(d.id, CommandType.RELEASE, {
          reason: `no new loan within ${d.tenant.retentionDays} days: phone released`,
        });
      });
      released++;
    }
    if (released > 0) this.logger.log(`Released ${released} phone(s) held for repeat lending past retention`);
    return { held: held.length, released };
  }
}
