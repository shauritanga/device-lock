import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHmac } from 'crypto';
import {
  CommandStatus,
  CommandType,
  DeviceStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { PushService } from '../notifications/push.service';
import { SmsService } from '../notifications/sms.service';
import { CollectionsService } from '../collections/collections.service';

/** Commands the agent must execute, with their resulting device state. */
const STATUS_AFTER_ACK: Partial<Record<CommandType, DeviceStatus>> = {
  [CommandType.LOCK]: DeviceStatus.LOCKED,
  [CommandType.UNLOCK]: DeviceStatus.ACTIVE,
  [CommandType.RELEASE]: DeviceStatus.RELEASED,
};

@Injectable()
export class CommandsService {
  private readonly logger = new Logger(CommandsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
    private readonly sms: SmsService,
    private readonly collections: CollectionsService,
  ) {}

  /** Queue a command for a device and attempt instant push (fallback: check-in). */
  async queue(
    deviceId: string,
    type: CommandType,
    opts: { reason?: string; issuedById?: string } = {},
  ) {
    const device = await this.prisma.scoped.device.findFirst({
      where: { id: deviceId },
      select: {
        id: true,
        tenantId: true,
        fcmToken: true,
        smsSecret: true,
        simPhoneNumber: true,
        customer: { select: { phone: true } },
      },
    });
    if (!device) throw new NotFoundException('Device not found');

    const command = await this.prisma.scoped.deviceCommand.create({
      data: {
        tenantId: device.tenantId,
        deviceId,
        type,
        reason: opts.reason,
        issuedById: opts.issuedById,
        status: CommandStatus.QUEUED,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    const pushed = await this.push.notifyCommandPending({
      deviceId,
      fcmToken: device.fcmToken,
    });
    if (pushed) {
      await this.prisma.scoped.deviceCommand.update({
        where: { id: command.id },
        data: { status: CommandStatus.SENT, sentAt: new Date() },
      });
    }
    await this.sendSmsFallback(device, command);
    return command;
  }

  private async sendSmsFallback(
    device: {
      id: string;
      tenantId: string;
      smsSecret: string | null;
      simPhoneNumber: string | null;
      customer: { phone: string } | null;
    },
    command: { id: string; type: CommandType; expiresAt: Date | null },
  ) {
    if (!device.smsSecret) return;
    if (!SMS_COMMAND_TYPES.has(command.type)) {
      return;
    }
    const phone = device.simPhoneNumber ?? device.customer?.phone;
    if (!phone) return;

    const expiresAt = command.expiresAt?.getTime() ?? Date.now() + 7 * 24 * 60 * 60 * 1000;
    const payload = `DL1|${command.id}|${command.type}|${expiresAt}`;
    const sig = createHmac('sha256', device.smsSecret)
      .update(payload)
      .digest('base64url')
      .slice(0, 32);
    const sent = await this.sms.send(phone, `${payload}|${sig}`);

    await this.prisma.scoped.deviceEvent.create({
      data: {
        tenantId: device.tenantId,
        deviceId: device.id,
        type: sent ? 'SMS_COMMAND_SENT' : 'SMS_COMMAND_STUBBED',
        metadata: { commandId: command.id, commandType: command.type },
      },
    });
  }

  listForDevice(deviceId: string) {
    return this.prisma.scoped.deviceCommand.findMany({
      where: { deviceId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Return commands the agent still needs to run, marking them SENT. Called from
   * the agent check-in. Uses the device's own tenant context (set by the guard).
   */
  async pullPending(deviceId: string) {
    const pending = await this.prisma.scoped.deviceCommand.findMany({
      where: {
        deviceId,
        status: { in: [CommandStatus.QUEUED, CommandStatus.SENT] },
      },
      orderBy: { createdAt: 'asc' },
    });

    const ids = pending.map((c) => c.id);
    if (ids.length) {
      await this.prisma.scoped.deviceCommand.updateMany({
        where: { id: { in: ids }, status: CommandStatus.QUEUED },
        data: { status: CommandStatus.SENT, sentAt: new Date() },
      });
    }
    return pending.map((c) => ({ id: c.id, type: c.type, reason: c.reason }));
  }

  /** Agent acknowledges a command; updates device state and writes an audit event. */
  async ack(
    deviceId: string,
    commandId: string,
    result: 'DONE' | 'FAILED',
    detail?: string,
  ) {
    const command = await this.prisma.scoped.deviceCommand.findFirst({
      where: { id: commandId, deviceId },
    });
    if (!command) throw new NotFoundException('Command not found');
    if (
      command.status === CommandStatus.ACKED ||
      command.status === CommandStatus.FAILED
    ) {
      throw new BadRequestException('Command already finalized');
    }

    const now = new Date();
    const ok = result === 'DONE';

    await this.prisma.scoped.$transaction(async (tx) => {
      await tx.deviceCommand.update({
        where: { id: commandId },
        data: {
          status: ok ? CommandStatus.ACKED : CommandStatus.FAILED,
          ackedAt: now,
        },
      });

      const newStatus = ok ? STATUS_AFTER_ACK[command.type] : undefined;
      if (newStatus) {
        await tx.device.update({
          where: { id: deviceId },
          data: {
            status: newStatus,
            lockedAt: newStatus === DeviceStatus.LOCKED ? now : null,
          },
        });
      }

      await tx.deviceEvent.create({
        data: {
          tenantId: command.tenantId,
          deviceId,
          type: ok ? `${command.type}_DONE` : `${command.type}_FAILED`,
          metadata: detail ? ({ detail } as Prisma.InputJsonValue) : undefined,
        },
      });
    });

    // A confirmed release may close the collection case (fully-paid loan +
    // released phone). Best-effort: never fail the ack over it.
    if (ok && command.type === CommandType.RELEASE) {
      try {
        await this.collections.onDeviceReleased(deviceId);
      } catch (e) {
        this.logger.warn(
          `Collections release hook failed for device ${deviceId}: ${(e as Error).message}`,
        );
      }
    }

    return { ok: true };
  }
}

const SMS_COMMAND_TYPES = new Set<CommandType>([
  CommandType.LOCK,
  CommandType.UNLOCK,
  CommandType.RELEASE,
]);
