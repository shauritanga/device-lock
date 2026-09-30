import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import {
  DeviceStatus,
  LoanStatus,
  PaymentStatus,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { ProvisioningService } from '../provisioning/provisioning.service';
import {
  CreateDeviceDto,
  ListDevicesQuery,
  UpdateDeviceDto,
} from './dto/device.dto';

const ENROLLMENT_TTL_DAYS = 7;
const AGENT_PACKAGE = 'com.devicelock.agent';

@Injectable()
export class DevicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly provisioning: ProvisioningService,
  ) {}

  /** Register a device and issue a one-time enrollment token (for the QR). */
  async register(dto: CreateDeviceDto) {
    const tenantId = this.prisma.currentTenantId;
    return this.prisma.scoped.$transaction(async (tx) => {
      const device = await tx.device.create({
        data: {
          tenantId,
          imei: dto.imei,
          serialNumber: dto.serialNumber,
          make: dto.make,
          model: dto.model,
          customerId: dto.customerId,
          status: DeviceStatus.PENDING_ENROLLMENT,
        },
      });

      const token = await tx.enrollmentToken.create({
        data: {
          tenantId,
          deviceId: device.id,
          token: randomBytes(24).toString('hex'),
          expiresAt: daysFromNow(ENROLLMENT_TTL_DAYS),
        },
      });

      return { device, enrollmentToken: token.token };
    });
  }

  findAll(query: ListDevicesQuery) {
    return this.prisma.scoped.device.findMany({
      where: {
        ...(query.status ? { status: query.status } : {}),
        ...(query.customerId ? { customerId: query.customerId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const device = await this.prisma.scoped.device.findFirst({
      where: { id },
      include: {
        customer: true,
        loan: true,
        enrollToken: true,
        events: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });
    if (!device) throw new NotFoundException('Device not found');
    return device;
  }

  async update(id: string, dto: UpdateDeviceDto) {
    await this.findOne(id);
    return this.prisma.scoped.device.update({ where: { id }, data: dto });
  }

  /**
   * Delete a device that never enrolled (failed QR setup, wrong phone, sale
   * abandoned). Refuses anything that ever enrolled and anything with confirmed
   * payments. Cascades the sale artifacts (loan, schedule, contract, tokens,
   * queued commands, events) and frees the IMEI for re-registration; the
   * customer record is kept.
   */
  async remove(id: string) {
    const device = await this.prisma.scoped.device.findFirst({
      where: { id },
      select: {
        id: true,
        status: true,
        lastCheckInAt: true,
        loan: {
          select: {
            id: true,
            payments: {
              where: { status: PaymentStatus.CONFIRMED },
              select: { id: true },
            },
          },
        },
      },
    });
    if (!device) throw new NotFoundException('Device not found');
    if (
      device.status !== DeviceStatus.PENDING_ENROLLMENT ||
      device.lastCheckInAt
    ) {
      throw new ConflictException(
        'Only devices that never enrolled can be deleted',
      );
    }
    if (device.loan && device.loan.payments.length > 0) {
      throw new ConflictException(
        'This sale has confirmed payments, so it cannot be deleted',
      );
    }
    await this.prisma.scoped.device.delete({ where: { id } });
    return { deleted: true, id };
  }

  async approveSimChange(id: string, reason?: string) {
    const device = await this.prisma.scoped.device.findFirst({
      where: { id },
      select: { id: true, tenantId: true, simFingerprint: true },
    });
    if (!device) throw new NotFoundException('Device not found');
    if (!device.simFingerprint) {
      throw new ConflictException('No reported SIM metadata to approve');
    }

    const now = new Date();
    return this.prisma.scoped.$transaction(async (tx) => {
      const updated = await tx.device.update({
        where: { id },
        data: {
          approvedSimFingerprint: device.simFingerprint,
          simChangeApprovedAt: now,
        },
      });
      await tx.deviceEvent.create({
        data: {
          tenantId: device.tenantId,
          deviceId: id,
          type: 'SIM_CHANGE_APPROVED',
          metadata: reason ? { reason } : undefined,
        },
      });
      return updated;
    });
  }

  /**
   * Authorize a device release. Release permanently relinquishes device-owner,
   * so it is gated on the backing loan being COMPLETED. An OWNER may `force` it
   * for a write-off / recovery when the loan is not yet settled. Returns the
   * reason string to record on the command; throws if release is not allowed.
   */
  async assertReleasable(
    id: string,
    actorRole: UserRole,
    force: boolean,
  ): Promise<string> {
    const device = await this.prisma.scoped.device.findFirst({
      where: { id },
      select: { id: true, status: true, loan: { select: { status: true } } },
    });
    if (!device) throw new NotFoundException('Device not found');
    if (device.status === DeviceStatus.RELEASED) {
      throw new ConflictException('Device is already released');
    }

    if (device.loan?.status === LoanStatus.COMPLETED) {
      return 'loan completed — device released';
    }
    if (!force) {
      throw new ConflictException(
        'Loan is not fully paid; release is gated on loan completion',
      );
    }
    if (actorRole !== UserRole.OWNER) {
      throw new ForbiddenException(
        'Only an owner can force-release before the loan is completed',
      );
    }
    return 'forced release before loan completion';
  }

  /** Issue a fresh enrollment token (e.g. the old QR expired before setup). */
  async regenerateEnrollment(id: string) {
    await this.findOne(id);
    const token = await this.prisma.scoped.enrollmentToken.upsert({
      where: { deviceId: id },
      create: {
        tenantId: this.prisma.currentTenantId,
        deviceId: id,
        token: randomBytes(24).toString('hex'),
        expiresAt: daysFromNow(ENROLLMENT_TTL_DAYS),
      },
      update: {
        token: randomBytes(24).toString('hex'),
        expiresAt: daysFromNow(ENROLLMENT_TTL_DAYS),
        consumedAt: null,
      },
    });
    return { enrollmentToken: token.token };
  }

  /**
   * Everything the console needs to render the provisioning QR. `qr` is the
   * exact Android setup-wizard payload (encode it verbatim into the QR); the
   * rest is metadata for the UI.
   */
  async enrollmentPayload(id: string) {
    const device = await this.findOne(id);
    if (!device.enrollToken) {
      throw new NotFoundException('No enrollment token; regenerate it first');
    }
    return {
      deviceId: device.id,
      imei: device.imei,
      package: AGENT_PACKAGE,
      enrollmentToken: device.enrollToken.token,
      expiresAt: device.enrollToken.expiresAt,
      consumedAt: device.enrollToken.consumedAt,
      qr: this.provisioning.buildProvisioningPayload(device.enrollToken.token),
    };
  }
}

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}
