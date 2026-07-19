import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CommandStatus,
  CommandType,
  DeviceStatus,
  InstallmentStatus,
  PaymentStatus,
} from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { CommandsService } from '../commands/commands.service';
import { randomToken, sha256 } from '../common/crypto.util';
import { PaymentsService } from '../payments/payments.service';
import { AckDto, CheckinDto, EnrollDto, PayNowDto } from './dto/agent.dto';

export interface DevicePolicy {
  graceDays: number;
  maxOfflineDays: number;
}

@Injectable()
export class AgentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commands: CommandsService,
    private readonly payments: PaymentsService,
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
    const smsSecret = randomToken(32);

    const sim = this.simMetadata(dto);
    const simFingerprint = this.simFingerprint(sim);

    await this.prisma.$transaction([
      this.prisma.device.update({
        where: { id: token.deviceId },
        data: {
          status: DeviceStatus.ACTIVE,
          agentTokenHash: sha256(agentToken),
          smsSecret,
          fcmToken: dto.fcmToken,
          serialNumber: dto.serialNumber ?? token.device.serialNumber,
          make: dto.make ?? token.device.make,
          model: dto.model ?? token.device.model,
          lastCheckInAt: new Date(),
          ...sim,
          simFingerprint,
          approvedSimFingerprint: simFingerprint,
          simChangeApprovedAt: simFingerprint ? new Date() : null,
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
      smsSecret,
      policy: await this.resolvePolicy(token.deviceId),
    };
  }

  /** Heartbeat: record contact, refresh push token, and hand back pending commands. */
  async checkin(deviceId: string, dto: CheckinDto) {
    const sim = this.simMetadata(dto);
    const simFingerprint = this.simFingerprint(sim);
    const smsSecret = await this.ensureSmsSecret(deviceId);
    await this.prisma.scoped.device.update({
      where: { id: deviceId },
      data: {
        lastCheckInAt: new Date(),
        ...(dto.fcmToken ? { fcmToken: dto.fcmToken } : {}),
        ...sim,
        ...(simFingerprint ? { simFingerprint } : {}),
      },
    });

    await this.auditManagementHealth(deviceId, dto);
    await this.handleSimChange(deviceId, sim, simFingerprint);

    return {
      smsSecret,
      policy: await this.resolvePolicy(deviceId),
      commands: await this.commands.pullPending(deviceId),
    };
  }

  private async ensureSmsSecret(deviceId: string) {
    const device = await this.prisma.scoped.device.findFirst({
      where: { id: deviceId },
      select: { smsSecret: true },
    });
    if (device?.smsSecret) return device.smsSecret;
    const smsSecret = randomToken(32);
    await this.prisma.scoped.device.update({
      where: { id: deviceId },
      data: { smsSecret },
    });
    return smsSecret;
  }

  private async auditManagementHealth(deviceId: string, dto: CheckinDto) {
    if (dto.isDeviceOwner === undefined && dto.managedRestrictionsApplied === undefined) {
      return;
    }
    const unhealthy = dto.isDeviceOwner === false || dto.managedRestrictionsApplied === false;
    const type = unhealthy ? 'MANAGEMENT_HEALTH_WARNING' : 'MANAGEMENT_HEALTH_OK';
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const existing = await this.prisma.scoped.deviceEvent.findFirst({
      where: { deviceId, type, createdAt: { gte: today } },
      select: { id: true },
    });
    if (existing) return;

    const device = await this.prisma.scoped.device.findFirst({
      where: { id: deviceId },
      select: { tenantId: true },
    });
    if (!device) return;

    await this.prisma.scoped.deviceEvent.create({
      data: {
        tenantId: device.tenantId,
        deviceId,
        type,
        metadata: {
          isDeviceOwner: dto.isDeviceOwner,
          managedRestrictionsApplied: dto.managedRestrictionsApplied,
        },
      },
    });
  }

  private async handleSimChange(
    deviceId: string,
    sim: ReturnType<AgentService['simMetadata']>,
    simFingerprint: string | null,
  ) {
    if (!simFingerprint) return;

    const device = await this.prisma.scoped.device.findFirst({
      where: { id: deviceId },
      select: {
        tenantId: true,
        approvedSimFingerprint: true,
        tenant: { select: { lockOnSimChange: true } },
      },
    });
    if (!device) return;

    if (!device.approvedSimFingerprint) {
      await this.prisma.scoped.device.update({
        where: { id: deviceId },
        data: {
          approvedSimFingerprint: simFingerprint,
          simChangeApprovedAt: new Date(),
        },
      });
      return;
    }
    if (device.approvedSimFingerprint === simFingerprint) return;

    const now = new Date();
    await this.prisma.scoped.device.update({
      where: { id: deviceId },
      data: { simLastChangedAt: now },
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const existingEvent = await this.prisma.scoped.deviceEvent.findFirst({
      where: { deviceId, type: 'SIM_CHANGED', createdAt: { gte: today } },
      select: { id: true },
    });
    if (!existingEvent) {
      await this.prisma.scoped.deviceEvent.create({
        data: {
          tenantId: device.tenantId,
          deviceId,
          type: 'SIM_CHANGED',
          metadata: {
            policy: device.tenant.lockOnSimChange ? 'LOCK' : 'ALERT',
            sim,
          },
        },
      });
    }

    if (!device.tenant.lockOnSimChange) return;

    const pendingLock = await this.prisma.scoped.deviceCommand.findFirst({
      where: {
        deviceId,
        type: CommandType.LOCK,
        status: { in: [CommandStatus.QUEUED, CommandStatus.SENT] },
      },
      select: { id: true },
    });
    if (!pendingLock) {
      await this.commands.queue(deviceId, CommandType.LOCK, {
        reason: 'unauthorized SIM change detected',
      });
    }
  }

  private simMetadata(dto: EnrollDto | CheckinDto) {
    return {
      simIccid: cleanNullable(dto.simIccid),
      simOperator: cleanNullable(dto.simOperator),
      simCountryIso: cleanNullable(dto.simCountryIso),
      simPhoneNumber: cleanNullable(dto.simPhoneNumber),
    };
  }

  private simFingerprint(sim: ReturnType<AgentService['simMetadata']>) {
    const stable = [sim.simIccid, sim.simOperator, sim.simCountryIso, sim.simPhoneNumber]
      .filter(Boolean)
      .join('|');
    return stable ? sha256(stable) : null;
  }

  ack(deviceId: string, commandId: string, dto: AckDto) {
    return this.commands.ack(deviceId, commandId, dto.result, dto.detail);
  }

  /** Read-only customer dashboard for the enrolled phone holder. */
  async customerSummary(deviceId: string) {
    const device = await this.prisma.scoped.device.findFirst({
      where: { id: deviceId },
      include: {
        customer: true,
        loan: {
          include: {
            installments: { orderBy: { sequence: 'asc' } },
            payments: { orderBy: { receivedAt: 'desc' } },
          },
        },
      },
    });
    if (!device) throw new NotFoundException('Device not found');

    const loan = device.loan;
    const installments = loan?.installments ?? [];
    const settledStatuses: InstallmentStatus[] = [
      InstallmentStatus.PAID,
      InstallmentStatus.WAIVED,
    ];
    const confirmedPayments = loan?.payments.filter(
      (p) => p.status === PaymentStatus.CONFIRMED,
    ) ?? [];
    const totalRepayable = installments.reduce(
      (sum, i) => sum + Number(i.amount),
      0,
    );
    const paidAmount = confirmedPayments.reduce(
      (sum, p) => sum + Number(p.amount),
      0,
    );
    const remainingAmount = Math.max(totalRepayable - paidAmount, 0);
    const overdueAmount = installments
      .filter(
        (i) =>
          i.status === InstallmentStatus.OVERDUE ||
          (i.dueDate < new Date() &&
            !settledStatuses.includes(i.status)),
      )
      .reduce((sum, i) => sum + Math.max(Number(i.amount) - Number(i.amountPaid), 0), 0);
    const nextPayment = installments.find(
      (i) => !settledStatuses.includes(i.status),
    );

    return {
      customer: device.customer
        ? {
            fullName: device.customer.fullName,
            phone: device.customer.phone,
            nationalId: device.customer.nationalId,
            address: device.customer.address,
          }
        : null,
      device: {
        imei: device.imei,
        serialNumber: device.serialNumber,
        make: device.make,
        model: device.model,
        status: device.status,
      },
      loan: loan
        ? {
            principal: Number(loan.principal),
            downPayment: Number(loan.downPayment),
            totalRepayable,
            paidAmount,
            remainingAmount,
            overdueAmount,
            currency: loan.currency,
            status: loan.status,
            startDate: loan.startDate,
          }
        : null,
      nextPayment: nextPayment
        ? {
            sequence: nextPayment.sequence,
            dueDate: nextPayment.dueDate,
            amount: Number(nextPayment.amount),
            amountPaid: Number(nextPayment.amountPaid),
            status: nextPayment.status,
          }
        : null,
      installments: installments.map((i) => ({
        sequence: i.sequence,
        dueDate: i.dueDate,
        amount: Number(i.amount),
        amountPaid: Number(i.amountPaid),
        status: i.status,
      })),
      recentPayments:
        loan?.payments.slice(0, 8).map((p) => ({
          amount: Number(p.amount),
          method: p.method,
          status: p.status,
          receivedAt: p.receivedAt,
        })) ?? [],
    };
  }

  /** Start a buyer-initiated mobile-money payment for this device's loan. */
  async payNow(deviceId: string, dto: PayNowDto) {
    const summary = await this.customerSummary(deviceId);
    if (!summary.customer?.phone) {
      throw new BadRequestException('Customer phone number is required');
    }
    if (!summary.loan || summary.loan.status !== 'ACTIVE') {
      throw new BadRequestException('No active loan for this device');
    }

    const dueAmount = summary.nextPayment
      ? Math.max(summary.nextPayment.amount - summary.nextPayment.amountPaid, 0)
      : summary.loan.remainingAmount;
    const amount = dto.amount ?? dueAmount;
    if (amount <= 0) {
      throw new BadRequestException('No outstanding amount to pay');
    }

    return this.payments.initiateMobileMoney({
      loanId: await this.requireDeviceLoanId(deviceId),
      amount,
      phoneNumber: dto.phoneNumber ?? summary.customer.phone,
    });
  }

  private async requireDeviceLoanId(deviceId: string) {
    const device = await this.prisma.scoped.device.findFirst({
      where: { id: deviceId },
      select: { loan: { select: { id: true } } },
    });
    if (!device?.loan) throw new NotFoundException('Loan not found');
    return device.loan.id;
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

function cleanNullable(value?: string) {
  return value?.trim() || null;
}
