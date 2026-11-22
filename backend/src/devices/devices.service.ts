import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import {
  CollectionCaseStatus,
  CommandStatus,
  CommandType,
  DeviceStatus,
  LoanStatus,
  PaymentStatus,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { SubscriptionAccessService } from '../subscription/subscription-access.service';
import { AgreementsService } from '../agreements/agreements.service';
import { ProvisioningService } from '../provisioning/provisioning.service';
import { AuthUser } from '../auth/auth.types';
import {
  AssignDevicesDto,
  BulkCreateDevicesDto,
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
    private readonly agreements: AgreementsService,
    private readonly subscription: SubscriptionAccessService,
  ) {}

  /** Register a device and issue a one-time enrollment token (for the QR). */
  async register(dto: CreateDeviceDto) {
    const tenantId = this.prisma.currentTenantId;
    await this.agreements.assertCanEnroll(tenantId);
    await this.subscription.assertCanRegisterPhone(tenantId);
    if (dto.assignedAgentId) await this.assertAgent(dto.assignedAgentId);
    return this.prisma.scoped.$transaction(async (tx) => {
      const device = await tx.device.create({
        data: {
          tenantId,
          imei: dto.imei.trim(),
          serialNumber: dto.serialNumber,
          make: dto.make,
          model: dto.model,
          customerId: dto.customerId,
          assignedAgentId: dto.assignedAgentId,
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

  /**
   * Register many phones into stock in one go. Phones already on file are
   * reported back rather than failing the whole batch.
   */
  async registerBulk(dto: BulkCreateDevicesDto) {
    const tenantId = this.prisma.currentTenantId;
    const imeis = [
      ...new Set(dto.imeis.map((i) => i.replace(/\s+/g, '')).filter(Boolean)),
    ];
    const tooShort = imeis.filter((i) => i.length < 4);
    if (tooShort.length) {
      throw new BadRequestException(
        `IMEI too short: ${tooShort.slice(0, 3).join(', ')}`,
      );
    }
    if (imeis.length === 0) throw new BadRequestException('No IMEIs provided');

    await this.agreements.assertCanEnroll(tenantId);
    if (dto.assignedAgentId) await this.assertAgent(dto.assignedAgentId);

    // Removed (archived) phones keep their IMEI, so they count as taken too.
    const existing = await this.prisma.scoped.device.findMany({
      where: { imei: { in: imeis } },
      select: {
        imei: true,
        status: true,
        archivedAt: true,
        customer: { select: { fullName: true } },
        assignedAgent: { select: { fullName: true } },
        loan: { select: { id: true } },
      },
    });
    const taken = new Set(existing.map((d) => d.imei));
    const skippedDetails = existing.map((d) => ({
      imei: d.imei,
      reason: d.archivedAt
        ? `status ${d.status.toLowerCase().replace(/_/g, ' ')}, removed from your device list`
        : d.customer || d.loan
          ? `sold${d.customer ? ` to ${d.customer.fullName}` : ''}`
          : d.assignedAgent
            ? `in stock with agent ${d.assignedAgent.fullName}`
            : `in stock, status ${d.status.toLowerCase().replace(/_/g, ' ')}`,
    }));
    const fresh = imeis.filter((i) => !taken.has(i));
    if (fresh.length > 0) {
      await this.subscription.assertCanRegisterPhone(tenantId, fresh.length);
    }

    const created = await this.prisma.scoped.$transaction(async (tx) => {
      const rows = [];
      for (const imei of fresh) {
        const device = await tx.device.create({
          data: {
            tenantId,
            imei,
            make: dto.make?.trim() || undefined,
            model: dto.model?.trim() || undefined,
            assignedAgentId: dto.assignedAgentId,
            status: DeviceStatus.PENDING_ENROLLMENT,
          },
        });
        await tx.enrollmentToken.create({
          data: {
            tenantId,
            deviceId: device.id,
            token: randomBytes(24).toString('hex'),
            expiresAt: daysFromNow(ENROLLMENT_TTL_DAYS),
          },
        });
        rows.push(device);
      }
      return rows;
    });
    return {
      created: created.length,
      skipped: imeis.filter((i) => taken.has(i)),
      skippedDetails,
      devices: created,
    };
  }

  /** Allocate phones to an agent (or return them to the shop with a null agent). */
  async assign(dto: AssignDevicesDto) {
    if (dto.agentId) await this.assertAgent(dto.agentId);
    const devices = await this.prisma.scoped.device.findMany({
      where: { id: { in: dto.deviceIds } },
      select: { id: true, loan: { select: { id: true } } },
    });
    if (devices.length !== new Set(dto.deviceIds).size) {
      throw new NotFoundException('One or more phones were not found');
    }
    if (devices.some((d) => d.loan)) {
      throw new ConflictException(
        'Phones that are already sold cannot be reassigned',
      );
    }
    await this.prisma.scoped.device.updateMany({
      where: { id: { in: dto.deviceIds } },
      data: { assignedAgentId: dto.agentId ?? null },
    });
    return { updated: devices.length, agentId: dto.agentId ?? null };
  }

  /** A sales agent only ever sees phones allocated to them or that they sold. */
  private agentScope(actor?: AuthUser) {
    if (!actor || actor.role !== UserRole.AGENT) return {};
    return {
      OR: [
        { assignedAgentId: actor.userId },
        { loan: { soldById: actor.userId } },
      ],
    };
  }

  /** Throws unless the caller may see this phone (agents: only their own). */
  async assertVisible(id: string, actor: AuthUser) {
    if (actor.role !== UserRole.AGENT) return;
    const hit = await this.prisma.scoped.device.findFirst({
      where: { id, ...this.agentScope(actor) },
      select: { id: true },
    });
    if (!hit) throw new NotFoundException('Device not found');
  }

  private async assertAgent(agentId: string) {
    const agent = await this.prisma.scoped.user.findFirst({
      where: { id: agentId, role: UserRole.AGENT, isActive: true },
      select: { id: true },
    });
    if (!agent) throw new BadRequestException('Choose an active sales agent');
  }

  findAll(query: ListDevicesQuery, actor?: AuthUser) {
    return this.prisma.scoped.device.findMany({
      where: {
        archivedAt: null,
        ...(query.status ? { status: query.status } : {}),
        ...(query.customerId ? { customerId: query.customerId } : {}),
        // Combined with AND so an agent's own-phones rule can never be overridden.
        AND: [
          this.agentScope(actor),
          ...(query.available === 'true'
            ? [
                {
                  loan: { is: null },
                  OR: [
                    { customerId: null, status: DeviceStatus.PENDING_ENROLLMENT },
                    // Held for repeat lending: enrolled, unrestricted, waiting for its customer's next loan.
                    { dormantSince: { not: null }, status: DeviceStatus.ACTIVE },
                  ],
                },
              ]
            : []),
        ],
      },
      orderBy: { createdAt: 'desc' },
      include: {
        customer: { select: { id: true, fullName: true, phone: true } },
        assignedAgent: { select: { id: true, fullName: true } },
        loan: {
          select: {
            id: true,
            status: true,
            soldBy: { select: { id: true, fullName: true, role: true } },
          },
        },
      },
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
  async remove(id: string, actor: AuthUser) {
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
    // A released phone belongs to the customer now. The owner can drop it from
    // the list; it is archived, not erased, so payment history survives.
    if (device.status === DeviceStatus.RELEASED) {
      if (actor.role !== UserRole.OWNER) {
        throw new ForbiddenException('Only an owner can remove a released phone');
      }
      await this.prisma.scoped.device.update({
        where: { id },
        data: { archivedAt: new Date() },
      });
      return { deleted: true, id, archived: true };
    }
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
  /**
   * Guards and audits a lock/unlock issued by a platform admin (who has no
   * tenant of their own). Records who did it and why in the device history so
   * the seller can see it.
   */
  async auditAdminLockAction(
    id: string,
    action: 'LOCK' | 'UNLOCK',
    actor: { userId: string; role: UserRole },
    reason: string | undefined,
  ) {
    const trimmed = reason?.trim() ?? '';
    if (trimmed.length < 3) {
      throw new BadRequestException('A reason is required (at least 3 characters)');
    }
    const device = await this.prisma.scoped.device.findFirst({
      where: { id },
      select: {
        id: true,
        tenantId: true,
        status: true,
        loan: { select: { collectionCase: { select: { status: true } } } },
      },
    });
    if (!device) throw new NotFoundException('Device not found');
    const caseStatus = device.loan?.collectionCase?.status;
    if (!caseStatus || caseStatus === CollectionCaseStatus.CLOSED) {
      throw new ForbiddenException(
        'This phone is not under call centre management (the shop has no active collections subscription, or the loan is closed), so it cannot be locked or unlocked by the platform',
      );
    }
    if (
      device.status === DeviceStatus.PENDING_ENROLLMENT ||
      device.status === DeviceStatus.RELEASED ||
      device.status === DeviceStatus.WIPED
    ) {
      throw new ConflictException(
        `Cannot ${action.toLowerCase()} a device that is ${device.status.toLowerCase().replace('_', ' ')}`,
      );
    }
    await this.prisma.scoped.deviceEvent.create({
      data: {
        tenantId: device.tenantId,
        deviceId: id,
        type: action === 'LOCK' ? 'ADMIN_LOCK_QUEUED' : 'ADMIN_UNLOCK_QUEUED',
        metadata: { reason: trimmed, byUserId: actor.userId, byRole: actor.role },
      },
    });
    return trimmed;
  }

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
    if (
      device.status === DeviceStatus.PENDING_ENROLLMENT ||
      device.status === DeviceStatus.WIPED
    ) {
      throw new ConflictException(
        `Cannot release a device that is ${device.status.toLowerCase().replace('_', ' ')}`,
      );
    }
    const inFlight = await this.prisma.scoped.deviceCommand.count({
      where: {
        deviceId: id,
        type: CommandType.RELEASE,
        status: { in: [CommandStatus.QUEUED, CommandStatus.SENT] },
      },
    });
    if (inFlight > 0) {
      throw new ConflictException(
        "A release is already waiting for the phone's next check-in",
      );
    }

    if (device.loan?.status === LoanStatus.COMPLETED) {
      return 'loan completed — device released';
    }
    if (!device.loan) {
      return 'no active loan — phone released';
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
