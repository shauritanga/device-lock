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
  LoanStatus,
  PaymentStatus,
} from '@prisma/client';
import { ClsService } from 'nestjs-cls';
import { CollectionsService } from '../collections/collections.service';
import { TENANT_ID_KEY } from '../common/tenant/tenant-context';
import { PrismaService } from '../common/prisma/prisma.service';
import { CommandsService } from '../commands/commands.service';
import { randomToken, sha256 } from '../common/crypto.util';
import { SnippeService } from '../integrations/snippe/snippe.service';
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
    private readonly cls: ClsService,
    private readonly collections: CollectionsService,
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

    // A phone sold with a deposit is locked from its first check-in until the deposit is paid.
    this.cls.set(TENANT_ID_KEY, token.tenantId);
    await this.commands.lockIfDepositDue(token.deviceId);
    // Enrolled phones are sent to the call centre automatically: the shop hands nothing over.
    await this.collections
      .ensureMonitoringCases(token.tenantId, token.deviceId)
      .catch(() => undefined);

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
        ...(dto.appVersion ? { agentVersion: dto.appVersion } : {}),
        ...(dto.ignoringBatteryOptimizations !== undefined
          ? { ignoresBatteryOpt: dto.ignoringBatteryOptimizations }
          : {}),
        ...(dto.backgroundRestricted !== undefined
          ? { backgroundRestricted: dto.backgroundRestricted }
          : {}),
        ...(dto.standbyBucket ? { standbyBucket: dto.standbyBucket } : {}),
        ...sim,
        ...(simFingerprint ? { simFingerprint } : {}),
        ...(dto.latitude != null && dto.longitude != null
          ? {
              lastLat: dto.latitude,
              lastLng: dto.longitude,
              lastLocationAccuracy: dto.locationAccuracy ?? null,
              lastLocationAt: new Date(),
            }
          : {}),
      },
    });

    await this.auditManagementHealth(deviceId, dto);
    await this.handleSimChange(deviceId, sim, simFingerprint);
    await this.syncReportedLockState(deviceId, dto.lockState);

    return {
      smsSecret,
      policy: await this.resolvePolicy(deviceId),
      commands: await this.commands.pullPending(deviceId),
    };
  }

  /**
   * The phone can lock itself (offline policy, cached due date). Record what it
   * reports so the server's view matches, and clear a self-lock when the buyer
   * has no arrears, otherwise a paid-up phone would stay locked forever.
   */
  private async syncReportedLockState(deviceId: string, reported?: string) {
    if (reported !== 'LOCKED' && reported !== 'UNLOCKED') return;
    const device = await this.prisma.scoped.device.findFirst({
      where: { id: deviceId },
      select: { id: true, tenantId: true, status: true, loan: { select: { id: true, status: true } } },
    });
    if (!device) return;
    const pending = await this.prisma.scoped.deviceCommand.findFirst({
      where: {
        deviceId,
        type: { in: [CommandType.LOCK, CommandType.UNLOCK] },
        status: { in: [CommandStatus.QUEUED, CommandStatus.SENT] },
      },
      select: { id: true },
    });
    if (pending) return; // a command in flight will settle the state itself

    if (reported === 'LOCKED' && device.status === DeviceStatus.ACTIVE) {
      await this.prisma.scoped.device.update({
        where: { id: deviceId },
        data: { status: DeviceStatus.LOCKED },
      });
      await this.prisma.scoped.deviceEvent.create({
        data: { tenantId: device.tenantId, deviceId, type: 'LOCK_SELF_REPORTED', metadata: {} },
      });
      if (device.loan?.status === LoanStatus.ACTIVE) {
        const arrears = await this.prisma.scoped.installment.count({
          where: {
            loanId: device.loan.id,
            dueDate: { lte: new Date() },
            status: { notIn: [InstallmentStatus.PAID, InstallmentStatus.WAIVED] },
          },
        });
        if (arrears === 0) {
          await this.commands.queue(deviceId, CommandType.UNLOCK, {
            reason: 'phone locked itself but no installment is overdue',
          });
        }
      }
    } else if (reported === 'UNLOCKED' && device.status === DeviceStatus.LOCKED) {
      await this.prisma.scoped.device.update({
        where: { id: deviceId },
        data: { status: DeviceStatus.ACTIVE },
      });
    }
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
    // No ICCID means the card could not be read (typical on the enrollment
    // request, before device-owner permission is granted). That is not a swap.
    // A phone already stuck locking on every check-in is opened once, if nothing is owed.
    if (!simFingerprint) {
      await this.unlockLoopingSimLock(deviceId);
      return;
    }

    const device = await this.prisma.scoped.device.findFirst({
      where: { id: deviceId },
      select: {
        tenantId: true,
        approvedSimFingerprint: true,
        simChangeApprovedAt: true,
        status: true,
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

    // The approved value was stored by the old fingerprint, which mixed in the
    // operator name and the line number, and often missed the ICCID at enroll.
    // A matching legacy hash is the same card. So is a reading we have already
    // locked for over and over: that loop is a false swap, not a new card.
    const sameCard = legacySimFingerprints(sim).includes(device.approvedSimFingerprint);
    const loops = await this.simLockCountSince(deviceId, device.simChangeApprovedAt);
    if (sameCard || loops >= 2) {
      await this.reconcileSim(
        device,
        deviceId,
        simFingerprint,
        sameCard ? 'same card, ICCID now readable' : 'repeated lock on one reading',
      );
      return;
    }

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
    // Already locked: queueing another LOCK on every check-in only spams the
    // phone and the owner's SMS bill.
    if (device.status === DeviceStatus.LOCKED) return;

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
        reason: SIM_CHANGE_LOCK_REASON,
      });
    }
  }

  /** Accept this ICCID and drop a lock that was caused only by the old fingerprint. */
  private async reconcileSim(
    device: { tenantId: string },
    deviceId: string,
    simFingerprint: string,
    reason: string,
  ) {
    const now = new Date();
    await this.prisma.scoped.device.update({
      where: { id: deviceId },
      data: { approvedSimFingerprint: simFingerprint, simChangeApprovedAt: now },
    });
    await this.prisma.scoped.deviceCommand.updateMany({
      where: {
        deviceId,
        type: CommandType.LOCK,
        reason: SIM_CHANGE_LOCK_REASON,
        status: { in: [CommandStatus.QUEUED, CommandStatus.SENT] },
      },
      data: { status: CommandStatus.EXPIRED },
    });
    await this.prisma.scoped.deviceEvent.create({
      data: {
        tenantId: device.tenantId,
        deviceId,
        type: 'SIM_REAPPROVED',
        metadata: { reason },
      },
    });
    await this.unlockIfOnlySimLocked(deviceId);
  }

  private simLockCountSince(deviceId: string, since: Date | null) {
    return this.prisma.scoped.deviceCommand.count({
      where: {
        deviceId,
        type: CommandType.LOCK,
        reason: SIM_CHANGE_LOCK_REASON,
        ...(since ? { createdAt: { gt: since } } : {}),
      },
    });
  }

  /** Paid-up phone locked only by the SIM loop: open it. A real arrears lock stays. */
  private async unlockLoopingSimLock(deviceId: string) {
    const device = await this.prisma.scoped.device.findFirst({
      where: { id: deviceId },
      select: { status: true, simChangeApprovedAt: true },
    });
    if (!device || device.status !== DeviceStatus.LOCKED) return;
    const loops = await this.simLockCountSince(deviceId, device.simChangeApprovedAt);
    if (loops < 2) return;
    await this.unlockIfOnlySimLocked(deviceId);
  }

  private async unlockIfOnlySimLocked(deviceId: string) {
    const device = await this.prisma.scoped.device.findFirst({
      where: { id: deviceId },
      select: { status: true, loan: { select: { id: true, status: true } } },
    });
    if (!device || device.status !== DeviceStatus.LOCKED) return;

    if (device.loan?.status === LoanStatus.ACTIVE) {
      const arrears = await this.prisma.scoped.installment.count({
        where: {
          loanId: device.loan.id,
          dueDate: { lte: new Date() },
          status: { notIn: [InstallmentStatus.PAID, InstallmentStatus.WAIVED] },
        },
      });
      if (arrears > 0) return;
    }

    const lastLock = await this.prisma.scoped.deviceCommand.findFirst({
      where: { deviceId, type: CommandType.LOCK },
      orderBy: { createdAt: 'desc' },
      select: { reason: true },
    });
    if (lastLock?.reason !== SIM_CHANGE_LOCK_REASON) return;

    await this.commands.queue(deviceId, CommandType.UNLOCK, {
      reason: 'same SIM as enrollment — reading no longer treated as a swap',
    });
  }

  private simMetadata(dto: EnrollDto | CheckinDto) {
    return {
      simIccid: cleanNullable(dto.simIccid),
      simOperator: cleanNullable(dto.simOperator),
      simCountryIso: cleanNullable(dto.simCountryIso),
      simPhoneNumber: cleanNullable(dto.simPhoneNumber),
    };
  }

  /**
   * Identity of the card. The operator name, country and line number are not
   * stable: Android often cannot read the ICCID until a second after enroll,
   * and the line number appears and disappears. Hashing those made every later
   * check-in look like a SIM swap.
   */
  private simFingerprint(sim: ReturnType<AgentService['simMetadata']>) {
    if (!sim.simIccid) return null;
    return sha256(sim.simIccid);
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

    // The payer may use any mobile-money wallet (a relative's, a different
    // SIM); the payment is still credited to this device's loan.
    let phoneNumber = summary.customer.phone;
    if (dto.phoneNumber?.trim()) {
      phoneNumber = SnippeService.normalizePhone(dto.phoneNumber);
      if (!/^255[67]\d{8}$/.test(phoneNumber)) {
        throw new BadRequestException(
          'Enter a Tanzanian mobile-money number (07… / 06… / 255…)',
        );
      }
    }

    return this.payments.initiateMobileMoney({
      loanId: await this.requireDeviceLoanId(deviceId),
      amount,
      phoneNumber,
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
        loan: { select: { frequency: true } },
      },
    });
    if (!device) throw new NotFoundException('Device not found');
    // No grace period: a phone is locked as soon as an installment is a day past due.
    return {
      graceDays: 0,
      maxOfflineDays: device.maxOfflineDays ?? device.tenant.maxOfflineDays,
    };
  }
}

function cleanNullable(value?: string) {
  return value?.trim() || null;
}

const SIM_CHANGE_LOCK_REASON = 'unauthorized SIM change detected';

/**
 * Fingerprints the previous code would have stored for this reading: every
 * non-empty field, and the same list without the ICCID. Enrollment often
 * hashed only the operator and country, because the ICCID was not readable yet.
 */
function legacySimFingerprints(sim: {
  simIccid: string | null;
  simOperator: string | null;
  simCountryIso: string | null;
  simPhoneNumber: string | null;
}): string[] {
  const hashes = new Set<string>();
  for (const includeIccid of [true, false]) {
    const parts = [
      includeIccid ? sim.simIccid : null,
      sim.simOperator,
      sim.simCountryIso,
      sim.simPhoneNumber,
    ].filter((part): part is string => !!part);
    if (parts.length) hashes.add(sha256(parts.join('|')));
  }
  return [...hashes];
}
