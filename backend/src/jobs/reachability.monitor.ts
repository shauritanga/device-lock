import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DeviceStatus, LoanStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';

/** A phone that should be checking in every ~15 minutes and has been silent this long is unreachable. */
const SILENT_AFTER_MS = 6 * 60 * 60 * 1000;
const ALERT_EVERY_MS = 24 * 60 * 60 * 1000;

/**
 * Watches enrolled phones with a live loan. If the agent app stops contacting the
 * server, locks and unlocks cannot be delivered, so this records a
 * DEVICE_UNREACHABLE event (once a day per phone) with what the phone last
 * reported about its battery restrictions, which is usually the cause.
 */
@Injectable()
export class ReachabilityMonitor {
  private readonly logger = new Logger(ReachabilityMonitor.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_30_MINUTES)
  async run() {
    const n = await this.scan();
    if (n > 0) this.logger.warn(`${n} enrolled phone(s) have stopped contacting the server`);
  }

  async scan(): Promise<number> {
    const now = Date.now();
    const silent = await this.prisma.device.findMany({
      where: {
        status: { in: [DeviceStatus.ACTIVE, DeviceStatus.LOCKED] },
        loan: { is: { status: LoanStatus.ACTIVE } },
        OR: [{ lastCheckInAt: { lt: new Date(now - SILENT_AFTER_MS) } }, { lastCheckInAt: null }],
      },
      select: {
        id: true,
        tenantId: true,
        lastCheckInAt: true,
        agentVersion: true,
        ignoresBatteryOpt: true,
        backgroundRestricted: true,
        standbyBucket: true,
      },
    });

    let raised = 0;
    for (const d of silent) {
      const recent = await this.prisma.deviceEvent.findFirst({
        where: {
          deviceId: d.id,
          type: 'DEVICE_UNREACHABLE',
          createdAt: { gte: new Date(now - ALERT_EVERY_MS) },
        },
        select: { id: true },
      });
      if (recent) continue;
      await this.prisma.deviceEvent.create({
        data: {
          tenantId: d.tenantId,
          deviceId: d.id,
          type: 'DEVICE_UNREACHABLE',
          metadata: {
            lastCheckInAt: d.lastCheckInAt?.toISOString() ?? null,
            silentHours: d.lastCheckInAt
              ? Math.round((now - d.lastCheckInAt.getTime()) / 3_600_000)
              : null,
            agentVersion: d.agentVersion,
            ignoresBatteryOptimizations: d.ignoresBatteryOpt,
            backgroundRestricted: d.backgroundRestricted,
            standbyBucket: d.standbyBucket,
          },
        },
      });
      raised++;
    }
    return raised;
  }
}
