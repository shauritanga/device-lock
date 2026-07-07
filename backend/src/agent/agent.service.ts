import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DeviceStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { CommandsService } from '../commands/commands.service';
import { randomToken, sha256 } from '../common/crypto.util';
import { AckDto, CheckinDto, EnrollDto } from './dto/agent.dto';

export interface DevicePolicy {
  graceDays: number;
  maxOfflineDays: number;
}

@Injectable()
export class AgentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commands: CommandsService,
  ) {}

  /** Consume an enrollment token and bind the device to its agent credentials. */
  async enroll(dto: EnrollDto) {
    // Unscoped: the agent has no tenant identity yet.
    const token = await this.prisma.enrollmentToken.findUnique({
      where: { token: dto.enrollmentToken },
      include: { device: true },
    });
    if (!token) throw new NotFoundException('Invalid enrollment token');
    if (token.consumedAt) {
      throw new BadRequestException('Enrollment token already used');
    }
    if (token.expiresAt < new Date()) {
      throw new BadRequestException('Enrollment token expired');
    }

    const agentToken = randomToken(32);

    await this.prisma.$transaction([
      this.prisma.device.update({
        where: { id: token.deviceId },
        data: {
          status: DeviceStatus.ACTIVE,
          agentTokenHash: sha256(agentToken),
          fcmToken: dto.fcmToken,
          serialNumber: dto.serialNumber ?? token.device.serialNumber,
          make: dto.make ?? token.device.make,
          model: dto.model ?? token.device.model,
          lastCheckInAt: new Date(),
        },
      }),
      this.prisma.enrollmentToken.update({
        where: { id: token.id },
        data: { consumedAt: new Date() },
      }),
      this.prisma.deviceEvent.create({
        data: {
          tenantId: token.tenantId,
          deviceId: token.deviceId,
          type: 'ENROLLED',
        },
      }),
    ]);

    return {
      deviceId: token.deviceId,
      agentToken,
      policy: await this.resolvePolicy(token.deviceId),
    };
  }

  /** Heartbeat: record contact, refresh push token, and hand back pending commands. */
  async checkin(deviceId: string, dto: CheckinDto) {
    await this.prisma.scoped.device.update({
      where: { id: deviceId },
      data: {
        lastCheckInAt: new Date(),
        ...(dto.fcmToken ? { fcmToken: dto.fcmToken } : {}),
      },
    });

    return {
      policy: await this.resolvePolicy(deviceId),
      commands: await this.commands.pullPending(deviceId),
    };
  }

  ack(deviceId: string, commandId: string, dto: AckDto) {
    return this.commands.ack(deviceId, commandId, dto.result, dto.detail);
  }

  /** Effective policy: device override falls back to the tenant default. */
  private async resolvePolicy(deviceId: string): Promise<DevicePolicy> {
    const device = await this.prisma.scoped.device.findFirst({
      where: { id: deviceId },
      select: {
        graceDays: true,
        maxOfflineDays: true,
        tenant: { select: { graceDays: true, maxOfflineDays: true } },
      },
    });
    if (!device) throw new NotFoundException('Device not found');
    return {
      graceDays: device.graceDays ?? device.tenant.graceDays,
      maxOfflineDays: device.maxOfflineDays ?? device.tenant.maxOfflineDays,
    };
  }
}
