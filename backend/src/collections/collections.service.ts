import * as fs from 'fs';
import * as path from 'path';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  CollectionCaseSource,
  CollectionCaseStatus,
  CollectionsInvoiceStatus,
  CollectionsPackage,
  CollectionsSubscriptionStatus,
  CommunicationDirection,
  CommunicationStatus,
  ContactChannel,
  ContactSessionStatus,
  ContactVerificationStatus,
  DeviceStatus,
  InstallmentStatus,
  LoanStatus,
  PaymentStatus,
  Prisma,
  PromiseToPayStatus,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuthUser } from '../auth/auth.types';
import { ReferCaseDto } from './dto/collections.dto';
import { CallProviderService } from '../call-centre/call-provider.service';
import {
  COLLECTIONS_PACKAGES,
  isPackageValidForCount,
  monthlyPrice,
} from './packages';
import {
  ActivateSubscriptionDto,
  AssignCaseDto,
  CompleteContactDto,
  CreatePlatformStaffDto,
  AssignCollectorMasterDto,
  CreatePromiseDto,
  ListCasesQuery,
  CollectorPerformanceQuery,
  GenerateCollectionsInvoiceDto,
  MarkInvoicePaidDto,
  ReportRangeQuery,
  SetCaseWaiverDto,
  StartContactDto,
  UpdateCollectorPhoneDto,
  UpdateCustomerKycDto,
  UpdatePromiseDto,
} from './dto/collections.dto';
import { hashPassword } from '../auth/auth.service';
import { generateTemporaryPassword } from '../common/crypto.util';
import { EmailService } from '../notifications/email.service';
import type { Env } from '../config/env.validation';

const SESSION_TTL_MS = 30 * 60 * 1000;
const INVOICE_DUE_DAYS = 14;

const PLATFORM_STAFF_ROLE_LABELS: Record<string, string> = {
  COLLECTIONS_ADMIN: 'Collections Admin',
  MASTER_COLLECTOR: 'Master Collector',
  COLLECTOR: 'Collector',
};

const OPEN_STATUSES: CollectionCaseStatus[] = [
  CollectionCaseStatus.OPEN,
  CollectionCaseStatus.IN_PROGRESS,
  CollectionCaseStatus.PROMISED,
  CollectionCaseStatus.ESCALATED,
];

const PLATFORM_ROLES = new Set<UserRole>([
  UserRole.SUPER_ADMIN,
  UserRole.COLLECTIONS_ADMIN,
  UserRole.MASTER_COLLECTOR,
  UserRole.COLLECTOR,
]);

@Injectable()
export class CollectionsService {
  private readonly logger = new Logger(CollectionsService.name);
  private readonly publicBaseUrl: string;
  private readonly uploadsRoot: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly callProvider: CallProviderService,
    private readonly email: EmailService,
    config: ConfigService<Env, true>,
  ) {
    this.publicBaseUrl = (
      config.get('PUBLIC_BASE_URL', { infer: true }) ?? 'http://localhost:3000'
    ).replace(/\/$/, '');
    // Mirrors app.module.ts's ServeStaticModule rootPath (backend/uploads),
    // resolved relative to this file so it's correct in both dev (src) and
    // built (dist) layouts regardless of the process's cwd.
    this.uploadsRoot = path.join(__dirname, '..', '..', 'uploads');
  }

  /** Nightly: past-due invoices + break PTPs + roll collector stats + sync cases. */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async runNightlyMaintenance() {
    const pastDue = await this.processPastDueInvoices();
    const broken = await this.breakOverduePromises();
    const rolled = await this.rollAllCollectorsDaily();
    const synced = await this.syncAllActiveSubscriptions();
    let autoAssigned = 0;
    try {
      const result = await this.autoAssignUnassigned(null, 2000);
      autoAssigned = result.assigned;
    } catch (e) {
      this.logger.warn(
        `Nightly auto-assign skipped: ${e instanceof Error ? e.message : e}`,
      );
    }
    this.logger.log(
      `Collections nightly: pastDue=${pastDue.markedPastDue}, ` +
        `brokenPtps=${broken.broken}, rolled=${rolled.rolled}, casesSynced=${synced.cases}, ` +
        `autoAssigned=${autoAssigned}`,
    );
  }

  listPackages() {
    return Object.values(COLLECTIONS_PACKAGES).map((p) => ({
      ...p,
      exampleMonthly:
        p.priceModel === 'PER_DEVICE'
          ? `${p.unitPrice} × devices`
          : p.flatPrice,
    }));
  }

  async countActiveDevices(tenantId: string) {
    return this.prisma.device.count({
      where: {
        tenantId,
        status: { in: [DeviceStatus.ACTIVE, DeviceStatus.LOCKED] },
      },
    });
  }

  async getSubscriptionForTenant(tenantId: string) {
    const sub = await this.prisma.collectionsSubscription.findUnique({
      where: { tenantId },
      include: {
        tenant: { select: { id: true, name: true } },
        activatedBy: { select: { id: true, fullName: true, email: true } },
      },
    });
    const activeDevices = await this.countActiveDevices(tenantId);
    return {
      subscription: sub,
      activeDevices,
      suggestedPackage: packageCodeForCount(activeDevices),
      estimatedMonthly: sub
        ? monthlyPrice(sub.packageCode, activeDevices)
        : null,
    };
  }

  async mySubscription(actor: AuthUser) {
    if (!actor.tenantId) {
      throw new BadRequestException('Platform users have no seller subscription');
    }
    return this.getSubscriptionForTenant(actor.tenantId);
  }

  async listSubscriptions(actor: AuthUser) {
    this.assertPlatformAdmin(actor);
    const rows = await this.prisma.collectionsSubscription.findMany({
      include: {
        tenant: { select: { id: true, name: true, isActive: true } },
        activatedBy: { select: { id: true, fullName: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
    const withCounts = await Promise.all(
      rows.map(async (s) => ({
        ...s,
        activeDevices: await this.countActiveDevices(s.tenantId),
        estimatedMonthly: monthlyPrice(s.packageCode, await this.countActiveDevices(s.tenantId)),
      })),
    );
    return withCounts;
  }

  async activate(dto: ActivateSubscriptionDto, actor: AuthUser) {
    this.assertPlatformAdmin(actor);

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: dto.tenantId },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');
    if (!tenant.isActive) throw new BadRequestException('Tenant is inactive');

    const activeDevices = await this.countActiveDevices(dto.tenantId);
    if (activeDevices < 1) {
      throw new BadRequestException(
        'Tenant has no active/locked devices to cover under a collections package',
      );
    }
    if (!isPackageValidForCount(dto.packageCode, activeDevices)) {
      const p = COLLECTIONS_PACKAGES[dto.packageCode];
      throw new BadRequestException(
        `Package ${dto.packageCode} requires ${p.deviceBandMin}–${p.deviceBandMax} active devices; tenant has ${activeDevices}`,
      );
    }

    const def = COLLECTIONS_PACKAGES[dto.packageCode];
    const now = new Date();

    const sub = await this.prisma.collectionsSubscription.upsert({
      where: { tenantId: dto.tenantId },
      create: {
        tenantId: dto.tenantId,
        packageCode: dto.packageCode,
        status: CollectionsSubscriptionStatus.ACTIVE,
        deviceBandMin: def.deviceBandMin,
        deviceBandMax: def.deviceBandMax,
        priceModel: def.priceModel,
        unitPrice: def.unitPrice,
        flatPrice: def.flatPrice,
        currency: def.currency,
        activatedAt: now,
        activatedById: actor.userId,
        notes: dto.notes,
      },
      update: {
        packageCode: dto.packageCode,
        status: CollectionsSubscriptionStatus.ACTIVE,
        deviceBandMin: def.deviceBandMin,
        deviceBandMax: def.deviceBandMax,
        priceModel: def.priceModel,
        unitPrice: def.unitPrice,
        flatPrice: def.flatPrice,
        currency: def.currency,
        activatedAt: now,
        activatedById: actor.userId,
        endsAt: null,
        notes: dto.notes,
      },
      include: { tenant: { select: { id: true, name: true } } },
    });

    // Keep tenant-level platform billing in step: the seller console's
    // Billing page reads billingPlan/subscriptionStatus, so an activated
    // collections package must be reflected there too.
    await this.prisma.tenant.update({
      where: { id: dto.tenantId },
      data: { billingPlan: dto.packageCode, subscriptionStatus: 'ACTIVE' },
    });

    const synced = await this.syncOverdueCasesForTenant(dto.tenantId);
    return {
      subscription: sub,
      activeDevices,
      estimatedMonthly: monthlyPrice(dto.packageCode, activeDevices),
      casesSynced: synced,
    };
  }

  async suspend(tenantId: string, actor: AuthUser) {
    this.assertPlatformAdmin(actor);
    const sub = await this.prisma.collectionsSubscription.findUnique({
      where: { tenantId },
    });
    if (!sub) throw new NotFoundException('Subscription not found');
    return this.prisma.collectionsSubscription.update({
      where: { tenantId },
      data: { status: CollectionsSubscriptionStatus.SUSPENDED },
    });
  }

  /**
   * Create/update CollectionCase rows for every ACTIVE loan with an OVERDUE
   * installment, when the tenant has an ACTIVE collections subscription.
   */
  async syncOverdueCasesForTenant(tenantId: string): Promise<number> {
    const sub = await this.prisma.collectionsSubscription.findUnique({
      where: { tenantId },
    });
    if (!sub || sub.status !== CollectionsSubscriptionStatus.ACTIVE) {
      return 0;
    }

    const loans = await this.prisma.loan.findMany({
      where: {
        tenantId,
        status: LoanStatus.ACTIVE,
        installments: { some: { status: InstallmentStatus.OVERDUE } },
      },
      include: {
        installments: {
          where: { status: InstallmentStatus.OVERDUE },
          orderBy: { dueDate: 'asc' },
          take: 1,
        },
      },
    });

    let n = 0;
    const now = new Date();
    for (const loan of loans) {
      const inst = loan.installments[0];
      if (!inst) continue;
      const amountDue = Math.max(
        Number(inst.amount) - Number(inst.amountPaid),
        0,
      );
      const daysOverdue = Math.max(
        0,
        Math.floor((now.getTime() - inst.dueDate.getTime()) / 86_400_000),
      );

      await this.prisma.collectionCase.upsert({
        where: { loanId: loan.id },
        create: {
          tenantId,
          loanId: loan.id,
          customerId: loan.customerId,
          deviceId: loan.deviceId,
          installmentId: inst.id,
          status: CollectionCaseStatus.OPEN,
          source: CollectionCaseSource.AUTO_OVERDUE,
          daysOverdue,
          amountDue,
          currency: loan.currency,
        },
        update: {
          installmentId: inst.id,
          daysOverdue,
          amountDue,
          currency: loan.currency,
          // Re-open if was closed as paid but overdue again
          ...(await this.shouldReopen(loan.id)
            ? {
                status: CollectionCaseStatus.OPEN,
                closedAt: null,
                closedReason: null,
              }
            : {}),
        },
      });
      n += 1;
    }
    return n;
  }

  private async shouldReopen(loanId: string) {
    const existing = await this.prisma.collectionCase.findUnique({
      where: { loanId },
      select: { status: true },
    });
    return (
      existing?.status === CollectionCaseStatus.PAID ||
      existing?.status === CollectionCaseStatus.CLOSED
    );
  }

  /** Called from overdue job for every tenant. */
  async syncAllActiveSubscriptions() {
    const subs = await this.prisma.collectionsSubscription.findMany({
      where: { status: CollectionsSubscriptionStatus.ACTIVE },
      select: { tenantId: true },
    });
    let total = 0;
    for (const s of subs) {
      total += await this.syncOverdueCasesForTenant(s.tenantId);
    }
    return { tenants: subs.length, cases: total };
  }

  /** Sync overdue cases, then auto-assign with the daily per-collector cap. */
  async syncAndAutoAssign(actor: AuthUser) {
    const synced = await this.syncAllActiveSubscriptions();
    let assigned = {
      assigned: 0,
      assignments: [] as Array<{ caseId: string; collectorId: string }>,
      dailyCap: 55,
    };
    try {
      assigned = await this.autoAssignUnassigned(actor, 2000);
    } catch (e) {
      // No collectors yet — sync still succeeded.
      this.logger.warn(
        `Auto-assign after sync skipped: ${e instanceof Error ? e.message : e}`,
      );
    }
    return { ...synced, autoAssigned: assigned.assigned, dailyCap: assigned.dailyCap };
  }

  async listCases(query: ListCasesQuery, actor: AuthUser) {
    const where: Record<string, unknown> = {};

    if (actor.role === UserRole.COLLECTOR) {
      where.assignedToId = actor.userId;
    } else if (actor.role === UserRole.MASTER_COLLECTOR) {
      const team = await this.prisma.user.findMany({
        where: { managedById: actor.userId, role: UserRole.COLLECTOR },
        select: { id: true },
      });
      where.OR = [
        { assignedToId: actor.userId },
        { assignedToId: { in: team.map((t) => t.id) } },
        { assignedToId: null },
      ];
    } else if (actor.tenantId) {
      // Seller staff: only their company
      where.tenantId = actor.tenantId;
    } else {
      // Platform admin
      if (query.tenantId) where.tenantId = query.tenantId;
      if (query.assignedToId) where.assignedToId = query.assignedToId;
      if (query.mine === '1' || query.mine === 'true') {
        where.assignedToId = actor.userId;
      }
    }

    if (query.status) {
      where.status = query.status;
    } else if (!query.status && actor.role === UserRole.COLLECTOR) {
      where.status = { in: OPEN_STATUSES };
    }

    const rows = await this.prisma.collectionCase.findMany({
      where,
      include: caseInclude,
      orderBy: [{ daysOverdue: 'desc' }, { updatedAt: 'asc' }],
      take: 200,
    });
    return rows.map(mapCase);
  }

  /**
   * Loans the seller could hand to the platform, with whether a case already
   * exists. Drives the "refer a customer" picker in the seller console.
   */
  async listReferableLoans(actor: AuthUser) {
    const tenantId = actor.tenantId;
    if (!tenantId) throw new ForbiddenException('Seller account required');

    const loans = await this.prisma.loan.findMany({
      where: { tenantId, status: LoanStatus.ACTIVE },
      include: {
        customer: { select: { id: true, fullName: true, phone: true } },
        device: { select: { id: true, imei: true, make: true, model: true } },
        installments: {
          where: { status: { in: [InstallmentStatus.OVERDUE, InstallmentStatus.PENDING] } },
          orderBy: { dueDate: 'asc' },
          take: 1,
        },
        collectionCase: {
          select: { id: true, status: true, source: true, referredAt: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 300,
    });

    const now = Date.now();
    return loans.map((loan) => {
      const inst = loan.installments[0] ?? null;
      return {
        loanId: loan.id,
        customerId: loan.customer?.id ?? null,
        customerName: loan.customer?.fullName ?? null,
        customerPhone: loan.customer?.phone ?? null,
        deviceImei: loan.device?.imei ?? null,
        deviceModel:
          [loan.device?.make, loan.device?.model].filter(Boolean).join(' ') || null,
        currency: loan.currency,
        nextDueDate: inst?.dueDate ?? null,
        amountDue: inst ? Math.max(Number(inst.amount) - Number(inst.amountPaid), 0) : 0,
        isOverdue: inst?.status === InstallmentStatus.OVERDUE,
        daysOverdue:
          inst && inst.status === InstallmentStatus.OVERDUE
            ? Math.max(0, Math.floor((now - inst.dueDate.getTime()) / 86_400_000))
            : 0,
        caseId: loan.collectionCase?.id ?? null,
        caseStatus: loan.collectionCase?.status ?? null,
        caseSource: loan.collectionCase?.source ?? null,
        referredAt: loan.collectionCase?.referredAt ?? null,
      };
    });
  }

  /**
   * Seller hand-off. A subscribed shop asks the platform to follow up one of
   * its loans, instead of waiting for the nightly overdue sweep. If the sweep
   * already created the case, this re-tags it so collectors can see the seller
   * asked for it directly, and reopens it if it had been closed.
   *
   * Gated on an ACTIVE subscription: handing work to the call centre is the
   * thing the seller is paying for.
   */
  async referCase(dto: ReferCaseDto, actor: AuthUser) {
    const tenantId = actor.tenantId;
    if (!tenantId) throw new ForbiddenException('Seller account required');

    const sub = await this.prisma.collectionsSubscription.findUnique({
      where: { tenantId },
    });
    if (!sub || sub.status !== CollectionsSubscriptionStatus.ACTIVE) {
      throw new BadRequestException(
        'An active managed collections subscription is required to hand cases to the platform.',
      );
    }

    const loan = await this.prisma.loan.findFirst({
      where: { id: dto.loanId, tenantId },
      include: {
        installments: {
          where: {
            status: { in: [InstallmentStatus.OVERDUE, InstallmentStatus.PENDING] },
          },
          orderBy: { dueDate: 'asc' },
          take: 1,
        },
      },
    });
    if (!loan) throw new NotFoundException('Loan not found');
    if (loan.status !== LoanStatus.ACTIVE) {
      throw new BadRequestException('Only active loans can be handed over');
    }

    const existing = await this.prisma.collectionCase.findUnique({
      where: { loanId: loan.id },
      select: { id: true, status: true },
    });

    const inst = loan.installments[0] ?? null;
    const now = new Date();
    const amountDue = inst
      ? Math.max(Number(inst.amount) - Number(inst.amountPaid), 0)
      : 0;
    const daysOverdue =
      inst && inst.status === InstallmentStatus.OVERDUE
        ? Math.max(0, Math.floor((now.getTime() - inst.dueDate.getTime()) / 86_400_000))
        : 0;

    const handoff = {
      source: CollectionCaseSource.SELLER_HANDOFF,
      referredById: actor.userId,
      referredAt: now,
      referralNote: dto.note ?? null,
    };

    const reopen =
      existing && !OPEN_STATUSES.includes(existing.status)
        ? { status: CollectionCaseStatus.OPEN, closedAt: null, closedReason: null }
        : {};

    const row = await this.prisma.collectionCase.upsert({
      where: { loanId: loan.id },
      create: {
        tenantId,
        loanId: loan.id,
        customerId: loan.customerId,
        deviceId: loan.deviceId,
        installmentId: inst?.id ?? null,
        status: CollectionCaseStatus.OPEN,
        amountDue,
        daysOverdue,
        currency: loan.currency,
        ...handoff,
      },
      update: {
        ...handoff,
        ...reopen,
        ...(inst ? { installmentId: inst.id, amountDue, daysOverdue } : {}),
      },
      include: caseInclude,
    });

    this.logger.log(
      `Seller hand-off: tenant=${tenantId} loan=${loan.id} case=${row.id} by=${actor.userId}`,
    );

    // Auto-assign newly arrived cases under the daily collector cap.
    try {
      await this.autoAssignUnassigned(null, 2000);
    } catch (e) {
      this.logger.warn(
        `Auto-assign after referral skipped: ${e instanceof Error ? e.message : e}`,
      );
    }

    const fresh = await this.prisma.collectionCase.findUnique({
      where: { id: row.id },
      include: caseInclude,
    });
    return mapCase(fresh ?? row);
  }

  async unassignedQueue(actor: AuthUser) {
    this.assertPlatformAdmin(actor);
    const rows = await this.prisma.collectionCase.findMany({
      where: {
        assignedToId: null,
        status: { in: OPEN_STATUSES },
      },
      include: caseInclude,
      orderBy: [{ daysOverdue: 'desc' }, { createdAt: 'asc' }],
      take: 200,
    });
    return rows.map(mapCase);
  }

  async myQueue(actor: AuthUser) {
    if (
      actor.role !== UserRole.COLLECTOR &&
      actor.role !== UserRole.MASTER_COLLECTOR &&
      actor.role !== UserRole.COLLECTIONS_ADMIN &&
      actor.role !== UserRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException('Only collectors use My Queue');
    }
    const rows = await this.prisma.collectionCase.findMany({
      where: {
        assignedToId: actor.userId,
        status: { in: OPEN_STATUSES },
      },
      include: caseInclude,
      orderBy: [{ daysOverdue: 'desc' }, { nextActionAt: 'asc' }],
      take: 200,
    });
    return rows.map(mapCase);
  }

  async getCase(id: string, actor: AuthUser) {
    const row = await this.prisma.collectionCase.findUnique({
      where: { id },
      include: caseInclude,
    });
    if (!row) throw new NotFoundException('Case not found');
    this.assertCanViewCase(row, actor);

    const [timeline, promises, sessions, loanCount, installments, payments] =
      await Promise.all([
        this.prisma.communicationLog.findMany({
          where: { caseId: id },
          orderBy: { occurredAt: 'desc' },
          take: 50,
          include: {
            collector: { select: { id: true, fullName: true } },
          },
        }),
        this.prisma.promiseToPay.findMany({
          where: { caseId: id },
          orderBy: { dueDate: 'asc' },
          include: {
            createdBy: { select: { id: true, fullName: true } },
          },
        }),
        this.prisma.contactSession.findMany({
          where: { caseId: id },
          orderBy: { initiatedAt: 'desc' },
          take: 20,
        }),
        this.prisma.loan.count({ where: { customerId: row.customerId } }),
        this.prisma.installment.findMany({
          where: { loanId: row.loanId },
          orderBy: { sequence: 'asc' },
        }),
        this.prisma.payment.findMany({
          where: { loanId: row.loanId, status: PaymentStatus.CONFIRMED },
          orderBy: { receivedAt: 'asc' },
        }),
      ]);

    return {
      ...mapCase(row),
      isRepeatCustomer: loanCount > 1,
      timeline,
      promises,
      sessions,
      repayments: buildRepaymentHistory(installments, payments),
    };
  }

  /**
   * Start a system-initiated contact session. Client must open launchUrl
   * (tel/sms/wa.me) or wait for bridge call. Proof comes via complete/proof later.
   */
  async startContact(caseId: string, dto: StartContactDto, actor: AuthUser) {
    this.assertCanWorkCase(actor);
    const c = await this.loadCaseForWork(caseId, actor);
    const customerPhone = c.customer.phone;
    if (!customerPhone) {
      throw new BadRequestException('Customer has no phone number');
    }

    const collector = await this.prisma.user.findUnique({
      where: { id: actor.userId },
      select: { id: true, phone: true, fullName: true },
    });
    const collectorPhone = collector?.phone ?? null;
    if (dto.channel === ContactChannel.CALL && !collectorPhone) {
      throw new BadRequestException(
        'Register your follow-up phone on Collections before starting a call',
      );
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
    const launchUrl = buildLaunchUrl(dto.channel, customerPhone, dto.body);

    let verificationStatus: ContactVerificationStatus =
      ContactVerificationStatus.NONE;
    let provider: string | null = null;
    let providerRef: string | null = null;
    let sessionStatus: ContactSessionStatus = ContactSessionStatus.PENDING;

    if (dto.channel === ContactChannel.CALL && collectorPhone) {
      const bridge = await this.callProvider.startBridgeCall({
        attemptId: `collections-${caseId}-${now.getTime()}`,
        staffPhone: collectorPhone,
        customerPhone,
        customerName: c.customer.fullName,
      });
      provider = bridge.provider;
      providerRef = bridge.providerCallId ?? null;
      if (bridge.verificationStatus === 'ATTEMPTED' || bridge.providerCallId) {
        verificationStatus = ContactVerificationStatus.ATTEMPTED;
      } else if (bridge.status === 'STUBBED') {
        // Dev: bridge not configured — still PENDING until complete/self-report
        verificationStatus = ContactVerificationStatus.NONE;
      } else if (bridge.verificationStatus === 'FAILED') {
        verificationStatus = ContactVerificationStatus.FAILED;
        sessionStatus = ContactSessionStatus.FAILED;
      }
    }

    // WhatsApp personal deep-link is never provider-verified
    if (dto.channel === ContactChannel.WHATSAPP) {
      verificationStatus = ContactVerificationStatus.NONE;
    }

    const session = await this.prisma.contactSession.create({
      data: {
        tenantId: c.tenantId,
        caseId: c.id,
        loanId: c.loanId,
        customerId: c.customerId,
        collectorId: actor.userId,
        channel: dto.channel,
        customerPhone,
        collectorPhone,
        bodyPreview: dto.body?.slice(0, 500),
        status: sessionStatus,
        verificationStatus,
        provider,
        providerRef,
        launchUrl,
        expiresAt,
      },
    });

    await this.prisma.communicationLog.create({
      data: {
        tenantId: c.tenantId,
        caseId: c.id,
        loanId: c.loanId,
        customerId: c.customerId,
        contactSessionId: session.id,
        collectorId: actor.userId,
        channel: dto.channel,
        direction: CommunicationDirection.OUTBOUND,
        status:
          sessionStatus === ContactSessionStatus.FAILED
            ? CommunicationStatus.FAILED
            : CommunicationStatus.PENDING_PROOF,
        verificationStatus,
        customerPhone,
        body: dto.body,
        providerRef,
        occurredAt: now,
      },
    });

    await this.prisma.collectionCase.update({
      where: { id: c.id },
      data: {
        lastContactedAt: now,
        followUpCount: { increment: 1 },
        status:
          c.status === CollectionCaseStatus.OPEN
            ? CollectionCaseStatus.IN_PROGRESS
            : c.status,
      },
    });

    return {
      session,
      launchUrl,
      verificationNote:
        dto.channel === ContactChannel.WHATSAPP
          ? 'Personal WhatsApp is Unverified until Business API is configured'
          : dto.channel === ContactChannel.CALL && verificationStatus === ContactVerificationStatus.ATTEMPTED
            ? 'Call bridge requested — awaiting provider callback or manual complete'
            : 'Open launchUrl on your phone, then complete the session with outcome',
    };
  }

  /**
   * Companion-app / device proof: mark session DEVICE_LOG_MATCHED when an
   * outgoing call/SMS log matches the session customer phone in the window.
   */
  async submitContactProof(
    sessionId: string,
    dto: import('./dto/collections.dto').SubmitContactProofDto,
    actor: AuthUser,
  ) {
    const session = await this.prisma.contactSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) throw new NotFoundException('Contact session not found');
    if (
      session.collectorId !== actor.userId &&
      actor.role !== UserRole.SUPER_ADMIN &&
      actor.role !== UserRole.COLLECTIONS_ADMIN
    ) {
      throw new ForbiddenException('Not your contact session');
    }
    if (session.status === ContactSessionStatus.COMPLETED) {
      return session;
    }

    const logAt = dto.logAt ? new Date(dto.logAt) : new Date();
    if (logAt < session.initiatedAt || logAt > session.expiresAt) {
      throw new BadRequestException(
        'Device log timestamp is outside the contact session window',
      );
    }

    const expected = normalizePhoneDigits(session.customerPhone);
    if (dto.matchedPhone) {
      const got = normalizePhoneDigits(dto.matchedPhone);
      if (!phonesMatch(expected, got)) {
        throw new BadRequestException(
          'Matched phone does not match session customer phone',
        );
      }
    }

    const now = new Date();
    const meta = {
      ...(dto.deviceMatchMeta ?? {}),
      logAt: logAt.toISOString(),
      matchedPhone: dto.matchedPhone,
      direction: dto.direction ?? 'OUTGOING',
      source: 'DEVICE_LOG',
    };

    const updated = await this.prisma.contactSession.update({
      where: { id: sessionId },
      data: {
        status: ContactSessionStatus.COMPLETED,
        verificationStatus: ContactVerificationStatus.DEVICE_LOG_MATCHED,
        durationSeconds: dto.durationSeconds ?? session.durationSeconds,
        deviceMatchMeta: meta as Prisma.InputJsonValue,
        completedAt: now,
      },
    });

    await this.prisma.communicationLog.updateMany({
      where: { contactSessionId: sessionId },
      data: {
        status: CommunicationStatus.COMPLETED,
        verificationStatus: ContactVerificationStatus.DEVICE_LOG_MATCHED,
        durationSeconds: dto.durationSeconds ?? undefined,
        metadata: meta as Prisma.InputJsonValue,
      },
    });

    await this.rollDailyStatsForCollector(session.collectorId, now);
    return updated;
  }

  /**
   * Round-robin assign unassigned OPEN cases to active COLLECTORs.
   * Each collector may receive at most DAILY_ASSIGN_CAP new assignments per day
   * (counted by assignedAt since start of UTC day).
   */
  async autoAssignUnassigned(actor: AuthUser | null, limit = 2000) {
    if (actor) this.assertPlatformAdmin(actor);

    const DAILY_ASSIGN_CAP = 55;
    const dayStart = startOfUtcDay(new Date());

    const collectors = await this.prisma.user.findMany({
      where: {
        role: UserRole.COLLECTOR,
        isActive: true,
        tenantId: null,
      },
      select: {
        id: true,
        fullName: true,
        _count: {
          select: {
            assignedCollectionCases: {
              where: { status: { in: OPEN_STATUSES } },
            },
          },
        },
      },
      orderBy: { fullName: 'asc' },
    });
    if (collectors.length === 0) {
      throw new BadRequestException('No active collectors to assign to');
    }

    const todayAssigned = await this.prisma.collectionCase.groupBy({
      by: ['assignedToId'],
      where: {
        assignedToId: { in: collectors.map((c) => c.id) },
        assignedAt: { gte: dayStart },
      },
      _count: { _all: true },
    });
    const todayByCollector = new Map(
      todayAssigned.map((r) => [r.assignedToId as string, r._count._all]),
    );

    type Slot = {
      id: string;
      fullName: string;
      openLoad: number;
      todayCount: number;
      remaining: number;
    };

    const slots: Slot[] = collectors
      .map((c) => {
        const todayCount = todayByCollector.get(c.id) ?? 0;
        return {
          id: c.id,
          fullName: c.fullName,
          openLoad: c._count.assignedCollectionCases,
          todayCount,
          remaining: Math.max(0, DAILY_ASSIGN_CAP - todayCount),
        };
      })
      .filter((s) => s.remaining > 0);

    if (slots.length === 0) {
      return {
        assigned: 0,
        assignments: [] as Array<{ caseId: string; collectorId: string }>,
        dailyCap: DAILY_ASSIGN_CAP,
        skippedReason: 'All collectors have reached the daily assignment cap of 55',
      };
    }

    const totalCapacity = slots.reduce((sum, s) => sum + s.remaining, 0);
    const take = Math.min(limit, totalCapacity, 2000);

    const unassigned = await this.prisma.collectionCase.findMany({
      where: {
        assignedToId: null,
        status: { in: OPEN_STATUSES },
      },
      orderBy: [{ daysOverdue: 'desc' }, { createdAt: 'asc' }],
      take,
    });

    const sortSlots = () =>
      slots.sort((a, b) => {
        if (a.remaining !== b.remaining) return b.remaining - a.remaining;
        return a.openLoad - b.openLoad;
      });

    sortSlots();

    const assigned: Array<{ caseId: string; collectorId: string }> = [];
    for (const c of unassigned) {
      sortSlots();
      const collector = slots.find((s) => s.remaining > 0);
      if (!collector) break;

      await this.prisma.collectionCase.update({
        where: { id: c.id },
        data: {
          assignedToId: collector.id,
          assignedAt: new Date(),
          status:
            c.status === CollectionCaseStatus.OPEN
              ? CollectionCaseStatus.IN_PROGRESS
              : c.status,
        },
      });
      assigned.push({ caseId: c.id, collectorId: collector.id });
      collector.remaining -= 1;
      collector.todayCount += 1;
      collector.openLoad += 1;
    }

    return {
      assigned: assigned.length,
      assignments: assigned,
      dailyCap: DAILY_ASSIGN_CAP,
      collectorCapacity: slots.map((s) => ({
        collectorId: s.id,
        fullName: s.fullName,
        assignedToday: s.todayCount,
        remainingToday: s.remaining,
      })),
    };
  }

  /**
   * Seller transparency: what collectors did on this company's cases this week.
   */
  async sellerActivitySummary(actor: AuthUser, days = 7) {
    if (!actor.tenantId) {
      throw new BadRequestException(
        'Only seller staff use this summary; platform can filter reports by tenant',
      );
    }
    const since = new Date(Date.now() - days * 86_400_000);
    const tenantId = actor.tenantId;

    const sessions = await this.prisma.contactSession.findMany({
      where: {
        tenantId,
        initiatedAt: { gte: since },
      },
      include: {
        collector: { select: { id: true, fullName: true } },
        case: {
          select: {
            id: true,
            customer: { select: { fullName: true, phone: true } },
          },
        },
      },
      orderBy: { initiatedAt: 'desc' },
      take: 200,
    });

    const ptps = await this.prisma.promiseToPay.findMany({
      where: { tenantId, createdAt: { gte: since } },
      include: {
        createdBy: { select: { fullName: true } },
        case: {
          select: {
            customer: { select: { fullName: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const byCollector = new Map<
      string,
      { collectorId: string; collectorName: string; contacts: number; calls: number; sms: number; wa: number }
    >();
    for (const s of sessions) {
      const row = byCollector.get(s.collectorId) ?? {
        collectorId: s.collectorId,
        collectorName: s.collector.fullName,
        contacts: 0,
        calls: 0,
        sms: 0,
        wa: 0,
      };
      row.contacts += 1;
      if (s.channel === ContactChannel.CALL) row.calls += 1;
      if (s.channel === ContactChannel.SMS) row.sms += 1;
      if (s.channel === ContactChannel.WHATSAPP) row.wa += 1;
      byCollector.set(s.collectorId, row);
    }

    return {
      periodDays: days,
      since,
      totals: {
        contacts: sessions.length,
        promises: ptps.length,
        collectorsActive: byCollector.size,
      },
      byCollector: [...byCollector.values()],
      recentContacts: sessions.slice(0, 30).map((s) => ({
        id: s.id,
        channel: s.channel,
        verificationStatus: s.verificationStatus,
        status: s.status,
        initiatedAt: s.initiatedAt,
        collectorName: s.collector.fullName,
        customerName: s.case.customer.fullName,
        customerPhone: s.case.customer.phone,
        caseId: s.caseId,
      })),
      recentPromises: ptps.map((p) => ({
        id: p.id,
        amount: p.promisedAmount,
        dueDate: p.dueDate,
        status: p.status,
        collectorName: p.createdBy?.fullName ?? null,
        customerName: p.case.customer.fullName,
        caseId: p.caseId,
      })),
    };
  }

  async completeContact(
    sessionId: string,
    dto: CompleteContactDto,
    actor: AuthUser,
  ) {
    const session = await this.prisma.contactSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) throw new NotFoundException('Contact session not found');
    if (
      session.collectorId !== actor.userId &&
      actor.role !== UserRole.SUPER_ADMIN &&
      actor.role !== UserRole.COLLECTIONS_ADMIN
    ) {
      throw new ForbiddenException('Not your contact session');
    }

    if (session.status === ContactSessionStatus.COMPLETED) {
      return session;
    }

    const now = new Date();
    let verification =
      dto.verificationStatus ?? ContactVerificationStatus.SELF_REPORTED;

    if (dto.deviceMatchMeta) {
      verification = ContactVerificationStatus.DEVICE_LOG_MATCHED;
    }
    if (
      session.verificationStatus === ContactVerificationStatus.ATTEMPTED &&
      !dto.verificationStatus &&
      !dto.deviceMatchMeta
    ) {
      // Keep ATTEMPTED if already bridge-started and no stronger proof
      verification = ContactVerificationStatus.ATTEMPTED;
    }
    if (session.expiresAt < now && verification === ContactVerificationStatus.SELF_REPORTED) {
      // Late self-report still allowed but flagged
      verification = ContactVerificationStatus.SELF_REPORTED;
    }

    const updated = await this.prisma.contactSession.update({
      where: { id: sessionId },
      data: {
        status: ContactSessionStatus.COMPLETED,
        verificationStatus: verification,
        durationSeconds: dto.durationSeconds,
        outcomeNote: dto.outcomeNote,
        communicationResult: dto.communicationResult,
        deviceMatchMeta: dto.deviceMatchMeta
          ? (dto.deviceMatchMeta as Prisma.InputJsonValue)
          : undefined,
        completedAt: now,
      },
    });

    await this.prisma.communicationLog.updateMany({
      where: { contactSessionId: sessionId },
      data: {
        status: CommunicationStatus.COMPLETED,
        verificationStatus: verification,
        durationSeconds: dto.durationSeconds,
        communicationResult: dto.communicationResult,
        body: dto.outcomeNote
          ? `${session.bodyPreview ?? ''}\nOutcome: ${dto.outcomeNote}`.trim()
          : undefined,
      },
    });

    await this.rollDailyStatsForCollector(session.collectorId, now);
    return updated;
  }

  async expireStaleSessions() {
    const now = new Date();
    const stale = await this.prisma.contactSession.updateMany({
      where: {
        status: ContactSessionStatus.PENDING,
        expiresAt: { lt: now },
      },
      data: {
        status: ContactSessionStatus.EXPIRED,
        verificationStatus: ContactVerificationStatus.NO_MATCH,
        completedAt: now,
      },
    });
    await this.prisma.communicationLog.updateMany({
      where: {
        status: CommunicationStatus.PENDING_PROOF,
        contactSession: {
          status: ContactSessionStatus.EXPIRED,
        },
      },
      data: {
        status: CommunicationStatus.FAILED,
        verificationStatus: ContactVerificationStatus.NO_MATCH,
      },
    });
    return stale;
  }

  async createPromise(caseId: string, dto: CreatePromiseDto, actor: AuthUser) {
    this.assertCanWorkCase(actor);
    const c = await this.loadCaseForWork(caseId, actor);
    const dueDate = new Date(dto.dueDate);
    if (Number.isNaN(dueDate.getTime())) {
      throw new BadRequestException('Invalid dueDate');
    }

    const ptp = await this.prisma.promiseToPay.create({
      data: {
        tenantId: c.tenantId,
        caseId: c.id,
        loanId: c.loanId,
        customerId: c.customerId,
        promisedAmount: dto.promisedAmount,
        currency: dto.currency ?? c.currency,
        dueDate,
        notes: dto.notes,
        createdById: actor.userId,
        status: PromiseToPayStatus.OPEN,
      },
      include: {
        createdBy: { select: { id: true, fullName: true } },
      },
    });

    await this.prisma.collectionCase.update({
      where: { id: c.id },
      data: {
        status: CollectionCaseStatus.PROMISED,
        nextActionAt: dueDate,
      },
    });

    return ptp;
  }

  async listPromises(actor: AuthUser, status?: PromiseToPayStatus) {
    const where: Prisma.PromiseToPayWhereInput = {};
    if (actor.role === UserRole.COLLECTOR) {
      where.createdById = actor.userId;
    } else if (actor.tenantId) {
      where.tenantId = actor.tenantId;
    }
    if (status) where.status = status;

    return this.prisma.promiseToPay.findMany({
      where,
      include: {
        case: {
          select: {
            id: true,
            daysOverdue: true,
            amountDue: true,
            status: true,
          },
        },
        tenant: { select: { id: true, name: true } },
        createdBy: { select: { id: true, fullName: true } },
      },
      orderBy: { dueDate: 'asc' },
      take: 100,
    });
  }

  async updatePromise(
    id: string,
    dto: UpdatePromiseDto,
    actor: AuthUser,
  ) {
    const ptp = await this.prisma.promiseToPay.findUnique({ where: { id } });
    if (!ptp) throw new NotFoundException('Promise not found');
    if (
      actor.role === UserRole.COLLECTOR &&
      ptp.createdById !== actor.userId
    ) {
      throw new ForbiddenException('Not your promise');
    }
    if (actor.tenantId && ptp.tenantId !== actor.tenantId) {
      throw new ForbiddenException('Wrong tenant');
    }
    if (
      !actor.tenantId &&
      actor.role !== UserRole.SUPER_ADMIN &&
      actor.role !== UserRole.COLLECTIONS_ADMIN &&
      actor.role !== UserRole.COLLECTOR
    ) {
      throw new ForbiddenException();
    }

    return this.prisma.promiseToPay.update({
      where: { id },
      data: {
        status: dto.status,
        notes: dto.notes,
      },
    });
  }

  private assertAdmin(actor: AuthUser) {
    if (
      actor.role === UserRole.SUPER_ADMIN ||
      actor.role === UserRole.COLLECTIONS_ADMIN
    ) {
      return;
    }
    throw new ForbiddenException();
  }

  /** Admin-entered employment info shown on the collector app's Customer Information tab. */
  async updateCustomerKyc(
    customerId: string,
    dto: UpdateCustomerKycDto,
    actor: AuthUser,
  ) {
    this.assertAdmin(actor);
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    return this.prisma.customer.update({
      where: { id: customerId },
      data: {
        occupation: dto.occupation,
        employerName: dto.employerName,
        employerPhone: dto.employerPhone,
        monthlyIncome: dto.monthlyIncome,
      },
    });
  }

  /**
   * Saves ID-card / selfie photos already written to disk by the multer
   * interceptor (see CollectionsController) and records their served URLs.
   */
  async saveCustomerKycPhotos(
    customerId: string,
    files: { idCard?: Express.Multer.File[]; selfie?: Express.Multer.File[] },
    actor: AuthUser,
  ) {
    this.assertAdmin(actor);
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    const idCardFile = files.idCard?.[0];
    const selfieFile = files.selfie?.[0];
    if (!idCardFile && !selfieFile) {
      throw new BadRequestException('No files uploaded');
    }

    const dir = this.kycUploadDir(customerId);
    const write = (field: 'idCard' | 'selfie', file: Express.Multer.File) => {
      const name = `${field}-${Date.now()}${path.extname(file.originalname)}`;
      fs.writeFileSync(path.join(dir, name), file.buffer);
      return `${this.publicBaseUrl}/uploads/kyc/${customerId}/${name}`;
    };

    return this.prisma.customer.update({
      where: { id: customerId },
      data: {
        ...(idCardFile ? { idCardPhotoUrl: write('idCard', idCardFile) } : {}),
        ...(selfieFile ? { selfiePhotoUrl: write('selfie', selfieFile) } : {}),
      },
    });
  }

  /** Where a customer's KYC uploads live on disk (creates the dir if missing). */
  private kycUploadDir(customerId: string): string {
    const dir = path.join(this.uploadsRoot, 'kyc', customerId);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  /** Admin-granted extension / penalty-interest waiver on a case (dashboard-only control). */
  async setCaseWaiver(id: string, dto: SetCaseWaiverDto, actor: AuthUser) {
    this.assertAdmin(actor);
    const row = await this.prisma.collectionCase.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Case not found');

    const enablingNewWaiver =
      dto.penaltyInterestReductionEnabled &&
      !row.penaltyInterestReductionEnabled;

    return this.prisma.collectionCase.update({
      where: { id },
      data: {
        extensionApplied: dto.extensionApplied,
        penaltyInterestReductionEnabled: dto.penaltyInterestReductionEnabled,
        penaltyInterestAmount: dto.penaltyInterestAmount,
        waiverValidUntil:
          dto.waiverValidUntil === undefined
            ? undefined
            : dto.waiverValidUntil === null
              ? null
              : new Date(dto.waiverValidUntil),
        // Snapshot the pre-waiver amount once, the first time a waiver is granted,
        // so the client can show "restored if unpaid" against the original figure.
        originalOverdueAmount: enablingNewWaiver
          ? row.amountDue
          : undefined,
      },
    });
  }

  /**
   * After a payment is confirmed on a loan: mark open PTPs KEPT when covered,
   * and close the collection case if the loan has no remaining OVERDUE installments.
   */
  async onPaymentConfirmed(loanId: string, paymentId: string, amount: number) {
    const caseRow = await this.prisma.collectionCase.findUnique({
      where: { loanId },
    });
    if (!caseRow) return { caseUpdated: false, ptpKept: 0 };

    // Mark oldest OPEN promise(s) as KEPT if due amount is covered (simple: first open PTP)
    const openPtps = await this.prisma.promiseToPay.findMany({
      where: {
        caseId: caseRow.id,
        status: PromiseToPayStatus.OPEN,
      },
      orderBy: { dueDate: 'asc' },
    });
    let remaining = amount;
    let ptpKept = 0;
    for (const ptp of openPtps) {
      if (remaining <= 0) break;
      const promised = Number(ptp.promisedAmount);
      if (remaining + 0.001 >= promised) {
        await this.prisma.promiseToPay.update({
          where: { id: ptp.id },
          data: {
            status: PromiseToPayStatus.KEPT,
            keptPaymentId: paymentId,
          },
        });
        remaining -= promised;
        ptpKept += 1;
      }
    }

    const overdueLeft = await this.prisma.installment.count({
      where: {
        loanId,
        status: InstallmentStatus.OVERDUE,
      },
    });
    const loan = await this.prisma.loan.findUnique({
      where: { id: loanId },
      select: { status: true },
    });

    let caseUpdated = false;
    if (
      overdueLeft === 0 ||
      loan?.status === LoanStatus.COMPLETED
    ) {
      if (
        caseRow.status !== CollectionCaseStatus.PAID &&
        caseRow.status !== CollectionCaseStatus.CLOSED
      ) {
        await this.prisma.collectionCase.update({
          where: { id: caseRow.id },
          data: {
            status:
              loan?.status === LoanStatus.COMPLETED
                ? CollectionCaseStatus.CLOSED
                : CollectionCaseStatus.PAID,
            closedAt: new Date(),
            closedReason:
              loan?.status === LoanStatus.COMPLETED
                ? 'loan completed'
                : 'arrears cleared',
            amountDue: 0,
          },
        });
        caseUpdated = true;
      }
    } else {
      // Refresh amount due from earliest overdue installment
      const inst = await this.prisma.installment.findFirst({
        where: { loanId, status: InstallmentStatus.OVERDUE },
        orderBy: { dueDate: 'asc' },
      });
      if (inst) {
        const amountDue = Math.max(
          Number(inst.amount) - Number(inst.amountPaid),
          0,
        );
        await this.prisma.collectionCase.update({
          where: { id: caseRow.id },
          data: {
            amountDue,
            installmentId: inst.id,
            daysOverdue: Math.max(
              0,
              Math.floor(
                (Date.now() - inst.dueDate.getTime()) / 86_400_000,
              ),
            ),
          },
        });
        caseUpdated = true;
      }
    }

    return { caseUpdated, ptpKept };
  }

  /** Mark OPEN promises whose dueDate has passed without payment as BROKEN. */
  async breakOverduePromises() {
    const now = new Date();
    const result = await this.prisma.promiseToPay.updateMany({
      where: {
        status: PromiseToPayStatus.OPEN,
        dueDate: { lt: now },
      },
      data: { status: PromiseToPayStatus.BROKEN },
    });
    // Cases that were PROMISED and now have only broken PTPs → back to IN_PROGRESS
    if (result.count > 0) {
      const cases = await this.prisma.collectionCase.findMany({
        where: { status: CollectionCaseStatus.PROMISED },
        select: {
          id: true,
          promisesToPay: {
            where: { status: PromiseToPayStatus.OPEN },
            select: { id: true },
            take: 1,
          },
        },
      });
      for (const c of cases) {
        if (c.promisesToPay.length === 0) {
          await this.prisma.collectionCase.update({
            where: { id: c.id },
            data: { status: CollectionCaseStatus.IN_PROGRESS },
          });
        }
      }
    }
    return { broken: result.count };
  }

  paidCasesCsv(rows: Awaited<ReturnType<CollectionsService['paidCasesReport']>>) {
    const header = [
      'paymentId',
      'receivedAt',
      'companyName',
      'customerName',
      'customerPhone',
      'deviceImei',
      'amount',
      'method',
      'caseId',
      'collectorName',
    ];
    const lines = [header.join(',')];
    for (const r of rows) {
      lines.push(
        [
          r.paymentId,
          r.receivedAt instanceof Date
            ? r.receivedAt.toISOString()
            : String(r.receivedAt),
          csvEscape(r.companyName),
          csvEscape(r.customerName),
          csvEscape(r.customerPhone),
          csvEscape(r.deviceImei ?? ''),
          String(r.amount),
          r.method,
          r.caseId ?? '',
          csvEscape(r.collectorName ?? ''),
        ].join(','),
      );
    }
    return lines.join('\n') + '\n';
  }

  collectorPerformanceCsv(
    data: Awaited<ReturnType<CollectionsService['collectorPerformance']>>,
  ) {
    const header = [
      'collectorId',
      'collectorName',
      'hoursWorked',
      'followUpsCount',
      'callsCount',
      'smsCount',
      'whatsappCount',
      'avgCallSeconds',
      'talkSeconds',
      'ptpCount',
      'daysActive',
    ];
    const lines = [header.join(',')];
    for (const r of data.byCollector) {
      lines.push(
        [
          r.collectorId,
          csvEscape(r.collectorName),
          String(r.hoursWorked),
          String(r.followUpsCount),
          String(r.callsCount),
          String(r.smsCount),
          String(r.whatsappCount),
          String(r.avgCallSeconds ?? ''),
          String(r.talkSeconds),
          String(r.ptpCount),
          String(r.daysActive),
        ].join(','),
      );
    }
    return lines.join('\n') + '\n';
  }

  /**
   * Paid cases report: confirmed payments with company (seller) identity.
   * Platform sees all; sellers see own tenant only.
   */
  async paidCasesReport(query: ReportRangeQuery, actor: AuthUser) {
    const { from, to } = parseRange(query);
    const where: Prisma.PaymentWhereInput = {
      status: PaymentStatus.CONFIRMED,
      receivedAt: { gte: from, lt: to },
    };
    if (actor.tenantId) {
      where.tenantId = actor.tenantId;
    } else if (query.tenantId) {
      this.assertPlatformAdmin(actor);
      where.tenantId = query.tenantId;
    } else {
      this.assertPlatformOrSeller(actor);
    }

    const payments = await this.prisma.payment.findMany({
      where,
      include: {
        tenant: { select: { id: true, name: true } },
        loan: {
          select: {
            id: true,
            customer: { select: { id: true, fullName: true, phone: true } },
            device: { select: { id: true, imei: true } },
            collectionCase: {
              select: {
                id: true,
                status: true,
                assignedTo: { select: { id: true, fullName: true } },
              },
            },
          },
        },
      },
      orderBy: { receivedAt: 'desc' },
      take: 500,
    });

    return payments.map((p) => ({
      paymentId: p.id,
      amount: p.amount,
      method: p.method,
      status: p.status,
      receivedAt: p.receivedAt,
      companyId: p.tenantId,
      companyName: p.tenant.name,
      loanId: p.loanId,
      customerName: p.loan.customer.fullName,
      customerPhone: p.loan.customer.phone,
      deviceImei: p.loan.device?.imei ?? null,
      caseId: p.loan.collectionCase?.id ?? null,
      caseStatus: p.loan.collectionCase?.status ?? null,
      collectorName: p.loan.collectionCase?.assignedTo?.fullName ?? null,
    }));
  }

  /**
   * Payment progress + collections performance for a date range.
   */
  async paymentStats(query: ReportRangeQuery, actor: AuthUser) {
    this.assertPlatformOrSeller(actor);
    const { from, to } = parseRange(query);

    let tenantIds: string[];
    if (actor.tenantId) {
      tenantIds = [actor.tenantId];
    } else if (query.tenantId) {
      this.assertPlatformAdmin(actor);
      tenantIds = [query.tenantId];
    } else {
      this.assertPlatformAdmin(actor);
      const subs = await this.prisma.collectionsSubscription.findMany({
        where: {
          status: {
            in: [
              CollectionsSubscriptionStatus.ACTIVE,
              CollectionsSubscriptionStatus.PAST_DUE,
              CollectionsSubscriptionStatus.SUSPENDED,
            ],
          },
        },
        select: { tenantId: true },
      });
      tenantIds = subs.map((s) => s.tenantId);
      // If no subscriptions yet, still allow empty stats
      if (tenantIds.length === 0) {
        tenantIds = ['__none__'];
      }
    }

    const openCases = await this.prisma.collectionCase.findMany({
      where: {
        tenantId: { in: tenantIds },
        status: { in: OPEN_STATUSES },
      },
      select: {
        id: true,
        tenantId: true,
        amountDue: true,
        daysOverdue: true,
        followUpCount: true,
        assignedToId: true,
      },
    });

    const payments = await this.prisma.payment.findMany({
      where: {
        tenantId: { in: tenantIds },
        status: PaymentStatus.CONFIRMED,
        receivedAt: { gte: from, lt: to },
      },
      select: { amount: true, tenantId: true, receivedAt: true, loanId: true },
    });

    const ptps = await this.prisma.promiseToPay.findMany({
      where: {
        tenantId: { in: tenantIds },
        dueDate: { gte: from, lt: to },
      },
      select: { status: true, promisedAmount: true, tenantId: true },
    });

    const sessions = await this.prisma.contactSession.findMany({
      where: {
        tenantId: { in: tenantIds },
        initiatedAt: { gte: from, lt: to },
      },
      select: {
        channel: true,
        verificationStatus: true,
        durationSeconds: true,
        collectorId: true,
        status: true,
      },
    });

    const overdueBook = openCases.reduce((s, c) => s + Number(c.amountDue), 0);
    const collected = payments.reduce((s, p) => s + Number(p.amount), 0);
    const ptpTotal = ptps.length;
    const ptpKept = ptps.filter((p) => p.status === PromiseToPayStatus.KEPT).length;
    const strongVerification = new Set<ContactVerificationStatus>([
      ContactVerificationStatus.PROVIDER_VERIFIED,
      ContactVerificationStatus.DEVICE_LOG_MATCHED,
      ContactVerificationStatus.ATTEMPTED,
    ]);
    const verifiedContacts = sessions.filter((s) =>
      strongVerification.has(s.verificationStatus),
    ).length;
    const selfReported = sessions.filter(
      (s) => s.verificationStatus === ContactVerificationStatus.SELF_REPORTED,
    ).length;
    const callSessions = sessions.filter((s) => s.channel === ContactChannel.CALL);
    const talkSeconds = callSessions.reduce(
      (s, c) => s + (c.durationSeconds ?? 0),
      0,
    );
    const callsWithDuration = callSessions.filter(
      (c) => c.durationSeconds != null && c.durationSeconds > 0,
    ).length;

    // By company
    const byCompanyMap = new Map<
      string,
      { tenantId: string; overdueBook: number; openCases: number; collected: number }
    >();
    for (const c of openCases) {
      const row = byCompanyMap.get(c.tenantId) ?? {
        tenantId: c.tenantId,
        overdueBook: 0,
        openCases: 0,
        collected: 0,
      };
      row.overdueBook += Number(c.amountDue);
      row.openCases += 1;
      byCompanyMap.set(c.tenantId, row);
    }
    for (const p of payments) {
      const row = byCompanyMap.get(p.tenantId) ?? {
        tenantId: p.tenantId,
        overdueBook: 0,
        openCases: 0,
        collected: 0,
      };
      row.collected += Number(p.amount);
      byCompanyMap.set(p.tenantId, row);
    }
    const tenants = await this.prisma.tenant.findMany({
      where: { id: { in: [...byCompanyMap.keys()] } },
      select: { id: true, name: true },
    });
    const nameById = new Map(tenants.map((t) => [t.id, t.name]));
    const byCompany = [...byCompanyMap.values()].map((r) => ({
      ...r,
      companyName: nameById.get(r.tenantId) ?? r.tenantId,
    }));

    // By collector (contacts + open caseload)
    const byCollectorMap = new Map<
      string,
      { collectorId: string; contacts: number; verified: number; talkSeconds: number }
    >();
    for (const s of sessions) {
      const row = byCollectorMap.get(s.collectorId) ?? {
        collectorId: s.collectorId,
        contacts: 0,
        verified: 0,
        talkSeconds: 0,
      };
      row.contacts += 1;
      if (strongVerification.has(s.verificationStatus)) {
        row.verified += 1;
      }
      row.talkSeconds += s.durationSeconds ?? 0;
      byCollectorMap.set(s.collectorId, row);
    }
    const collectors = await this.prisma.user.findMany({
      where: { id: { in: [...byCollectorMap.keys()] } },
      select: { id: true, fullName: true },
    });
    const collName = new Map(collectors.map((u) => [u.id, u.fullName]));
    const byCollector = [...byCollectorMap.values()].map((r) => ({
      ...r,
      collectorName: collName.get(r.collectorId) ?? r.collectorId,
      avgCallSeconds:
        r.talkSeconds > 0 && r.contacts > 0
          ? Math.round(r.talkSeconds / Math.max(1, r.contacts))
          : 0,
    }));

    return {
      period: { from, to },
      summary: {
        openCases: openCases.length,
        overdueBook,
        collectedInPeriod: collected,
        recoveryRate:
          overdueBook > 0 ? Number((collected / (overdueBook + collected)).toFixed(4)) : null,
        ptpDueInPeriod: ptpTotal,
        ptpKept,
        ptpKeepRate: ptpTotal > 0 ? Number((ptpKept / ptpTotal).toFixed(4)) : null,
        contactSessions: sessions.length,
        verifiedOrAttemptedContacts: verifiedContacts,
        selfReportedContacts: selfReported,
        avgCallSeconds:
          callsWithDuration > 0
            ? Math.round(talkSeconds / callsWithDuration)
            : null,
        totalTalkSeconds: talkSeconds,
      },
      byCompany,
      byCollector,
    };
  }

  /** Cases with follow-up counts in period (requirement 7). */
  async caseFollowupStats(caseId: string, query: ReportRangeQuery, actor: AuthUser) {
    const c = await this.prisma.collectionCase.findUnique({ where: { id: caseId } });
    if (!c) throw new NotFoundException('Case not found');
    this.assertCanViewCase(c, actor);
    const { from, to } = parseRange(query);

    const sessions = await this.prisma.contactSession.findMany({
      where: {
        caseId,
        initiatedAt: { gte: from, lt: to },
      },
      orderBy: { initiatedAt: 'desc' },
    });

    const byChannel = {
      CALL: sessions.filter((s) => s.channel === ContactChannel.CALL).length,
      SMS: sessions.filter((s) => s.channel === ContactChannel.SMS).length,
      WHATSAPP: sessions.filter((s) => s.channel === ContactChannel.WHATSAPP).length,
    };

    return {
      caseId,
      period: { from, to },
      totalFollowUps: sessions.length,
      lifetimeFollowUpCount: c.followUpCount,
      byChannel,
      sessions: sessions.map((s) => ({
        id: s.id,
        channel: s.channel,
        status: s.status,
        verificationStatus: s.verificationStatus,
        initiatedAt: s.initiatedAt,
        completedAt: s.completedAt,
        durationSeconds: s.durationSeconds,
      })),
    };
  }

  private assertPlatformOrSeller(actor: AuthUser) {
    if (
      actor.role === UserRole.SUPER_ADMIN ||
      actor.role === UserRole.COLLECTIONS_ADMIN ||
      actor.role === UserRole.OWNER ||
      actor.role === UserRole.MANAGER ||
      actor.role === UserRole.AGENT ||
      actor.role === UserRole.COLLECTOR ||
      actor.role === UserRole.MASTER_COLLECTOR
    ) {
      return;
    }
    throw new ForbiddenException();
  }

  // --- Phase 5: collections package invoices ---

  async listCollectionsInvoices(actor: AuthUser, tenantId?: string) {
    const where: Prisma.CollectionsInvoiceWhereInput = {};
    if (actor.tenantId) {
      where.tenantId = actor.tenantId;
    } else {
      this.assertPlatformAdmin(actor);
      if (tenantId) where.tenantId = tenantId;
    }
    return this.prisma.collectionsInvoice.findMany({
      where,
      include: {
        tenant: { select: { id: true, name: true } },
        subscription: {
          select: { id: true, packageCode: true, status: true },
        },
      },
      orderBy: { periodStart: 'desc' },
      take: 100,
    });
  }

  async generateCollectionsInvoice(
    dto: GenerateCollectionsInvoiceDto,
    actor: AuthUser,
  ) {
    this.assertPlatformAdmin(actor);
    const sub = await this.prisma.collectionsSubscription.findUnique({
      where: { tenantId: dto.tenantId },
      include: { tenant: { select: { id: true, name: true } } },
    });
    if (!sub) throw new NotFoundException('Collections subscription not found');
    if (
      sub.status !== CollectionsSubscriptionStatus.ACTIVE &&
      sub.status !== CollectionsSubscriptionStatus.PAST_DUE
    ) {
      throw new BadRequestException(
        `Subscription status ${sub.status} cannot be invoiced`,
      );
    }

    const asOf = dto.asOf ? new Date(dto.asOf) : new Date();
    const periodStart = new Date(
      Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), 1),
    );
    const periodEnd = new Date(
      Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() + 1, 1),
    );
    const activeDevices = await this.countActiveDevices(dto.tenantId);
    const def = COLLECTIONS_PACKAGES[sub.packageCode];
    const total = monthlyPrice(sub.packageCode, activeDevices);
    const lineItems =
      def.priceModel === 'PER_DEVICE'
        ? [
            {
              label: `${def.label} managed collections (${activeDevices} devices × ${def.unitPrice})`,
              quantity: activeDevices,
              unitPrice: def.unitPrice,
              amount: total,
            },
          ]
        : [
            {
              label: `${def.label} managed collections (flat monthly)`,
              quantity: 1,
              unitPrice: def.flatPrice,
              amount: total,
            },
          ];

    const dueDate = new Date(periodStart);
    dueDate.setUTCDate(dueDate.getUTCDate() + INVOICE_DUE_DAYS);

    const invoice = await this.prisma.collectionsInvoice.upsert({
      where: {
        subscriptionId_periodStart: {
          subscriptionId: sub.id,
          periodStart,
        },
      },
      create: {
        tenantId: sub.tenantId,
        subscriptionId: sub.id,
        periodStart,
        periodEnd,
        packageCode: sub.packageCode,
        activeDevices,
        priceModel: def.priceModel,
        unitPrice: def.unitPrice,
        flatPrice: def.flatPrice,
        currency: def.currency,
        subtotal: total,
        total,
        status: CollectionsInvoiceStatus.OPEN,
        lineItems: lineItems as Prisma.InputJsonValue,
        dueDate,
      },
      update: {
        activeDevices,
        packageCode: sub.packageCode,
        priceModel: def.priceModel,
        unitPrice: def.unitPrice,
        flatPrice: def.flatPrice,
        subtotal: total,
        total,
        lineItems: lineItems as Prisma.InputJsonValue,
        // Do not reopen PAID invoices on regenerate
      },
      include: {
        tenant: { select: { id: true, name: true } },
        subscription: { select: { id: true, packageCode: true, status: true } },
      },
    });

    return invoice;
  }

  async generateAllOpenMonth(actor: AuthUser, asOf?: string) {
    this.assertPlatformAdmin(actor);
    const subs = await this.prisma.collectionsSubscription.findMany({
      where: {
        status: {
          in: [
            CollectionsSubscriptionStatus.ACTIVE,
            CollectionsSubscriptionStatus.PAST_DUE,
          ],
        },
      },
      select: { tenantId: true },
    });
    const results = [];
    for (const s of subs) {
      results.push(
        await this.generateCollectionsInvoice(
          { tenantId: s.tenantId, asOf },
          actor,
        ),
      );
    }
    return { generated: results.length, invoices: results };
  }

  async markInvoicePaid(
    id: string,
    dto: MarkInvoicePaidDto,
    actor: AuthUser,
  ) {
    this.assertPlatformAdmin(actor);
    const inv = await this.prisma.collectionsInvoice.findUnique({
      where: { id },
    });
    if (!inv) throw new NotFoundException('Invoice not found');
    if (inv.status === CollectionsInvoiceStatus.VOID) {
      throw new BadRequestException('Cannot pay a void invoice');
    }

    const updated = await this.prisma.collectionsInvoice.update({
      where: { id },
      data: {
        status: CollectionsInvoiceStatus.PAID,
        paidAt: new Date(),
        notes: dto.notes ?? inv.notes,
      },
      include: {
        tenant: { select: { id: true, name: true } },
        subscription: { select: { id: true, packageCode: true, status: true } },
      },
    });

    // Reactivate subscription if it was past due
    await this.prisma.collectionsSubscription.updateMany({
      where: {
        id: inv.subscriptionId,
        status: CollectionsSubscriptionStatus.PAST_DUE,
      },
      data: { status: CollectionsSubscriptionStatus.ACTIVE },
    });

    return updated;
  }

  async voidInvoice(id: string, actor: AuthUser) {
    this.assertPlatformAdmin(actor);
    const inv = await this.prisma.collectionsInvoice.findUnique({
      where: { id },
    });
    if (!inv) throw new NotFoundException('Invoice not found');
    if (inv.status === CollectionsInvoiceStatus.PAID) {
      throw new BadRequestException('Cannot void a paid invoice');
    }
    return this.prisma.collectionsInvoice.update({
      where: { id },
      data: { status: CollectionsInvoiceStatus.VOID },
    });
  }

  /**
   * Mark OPEN invoices past dueDate as PAST_DUE and suspend those subscriptions
   * (managed queue stops receiving new work via ACTIVE-only sync).
   */
  async processPastDueInvoices(actor?: AuthUser) {
    if (actor) this.assertPlatformAdmin(actor);
    const now = new Date();
    const overdue = await this.prisma.collectionsInvoice.findMany({
      where: {
        status: CollectionsInvoiceStatus.OPEN,
        dueDate: { lt: now },
      },
    });
    let suspended = 0;
    for (const inv of overdue) {
      await this.prisma.collectionsInvoice.update({
        where: { id: inv.id },
        data: { status: CollectionsInvoiceStatus.PAST_DUE },
      });
      await this.prisma.collectionsSubscription.update({
        where: { id: inv.subscriptionId },
        data: { status: CollectionsSubscriptionStatus.PAST_DUE },
      });
      suspended += 1;
    }
    return { markedPastDue: overdue.length, subscriptionsAffected: suspended };
  }

  async billingSummaryForTenant(actor: AuthUser, tenantId?: string) {
    const tid = actor.tenantId ?? tenantId;
    if (!tid) {
      this.assertPlatformAdmin(actor);
      throw new BadRequestException('tenantId required for platform callers');
    }
    if (actor.tenantId && actor.tenantId !== tid) {
      throw new ForbiddenException();
    }
    if (!actor.tenantId) this.assertPlatformAdmin(actor);

    const sub = await this.getSubscriptionForTenant(tid);
    const invoices = await this.prisma.collectionsInvoice.findMany({
      where: { tenantId: tid },
      orderBy: { periodStart: 'desc' },
      take: 24,
    });
    const openBalance = invoices
      .filter(
        (i) =>
          i.status === CollectionsInvoiceStatus.OPEN ||
          i.status === CollectionsInvoiceStatus.PAST_DUE,
      )
      .reduce((s, i) => s + Number(i.total), 0);

    return {
      ...sub,
      openBalance,
      invoices,
    };
  }

  // --- Phase 4: work sessions + collector performance ---

  async clockIn(actor: AuthUser) {
    this.assertCanWorkCase(actor);
    const open = await this.prisma.collectorWorkSession.findFirst({
      where: { collectorId: actor.userId, endedAt: null },
    });
    if (open) {
      return { session: open, alreadyOpen: true };
    }
    const session = await this.prisma.collectorWorkSession.create({
      data: {
        collectorId: actor.userId,
        source: 'MANUAL_CLOCK',
      },
    });
    return { session, alreadyOpen: false };
  }

  async clockOut(actor: AuthUser) {
    this.assertCanWorkCase(actor);
    const open = await this.prisma.collectorWorkSession.findFirst({
      where: { collectorId: actor.userId, endedAt: null },
      orderBy: { startedAt: 'desc' },
    });
    if (!open) {
      throw new BadRequestException('No open work session to clock out');
    }
    const session = await this.prisma.collectorWorkSession.update({
      where: { id: open.id },
      data: { endedAt: new Date() },
    });
    // Refresh daily rollup for today
    await this.rollDailyStatsForCollector(actor.userId, new Date());
    return session;
  }

  async myWorkSession(actor: AuthUser) {
    this.assertCanWorkCase(actor);
    const open = await this.prisma.collectorWorkSession.findFirst({
      where: { collectorId: actor.userId, endedAt: null },
      orderBy: { startedAt: 'desc' },
    });
    const today = startOfUtcDay(new Date());
    const todaySessions = await this.prisma.collectorWorkSession.findMany({
      where: {
        collectorId: actor.userId,
        startedAt: { gte: today },
      },
      orderBy: { startedAt: 'desc' },
    });
    const workedSeconds = sumSessionSeconds(todaySessions, new Date());
    return {
      open,
      todayWorkedSeconds: workedSeconds,
      todaySessions,
    };
  }

  /**
   * Rebuild CollectorDailyStat for one collector on one calendar day (UTC).
   */
  async rollDailyStatsForCollector(collectorId: string, day: Date) {
    const from = startOfUtcDay(day);
    const to = new Date(from.getTime() + 86_400_000);

    const [sessions, workSessions, ptps] = await Promise.all([
      this.prisma.contactSession.findMany({
        where: {
          collectorId,
          initiatedAt: { gte: from, lt: to },
        },
      }),
      this.prisma.collectorWorkSession.findMany({
        where: {
          collectorId,
          OR: [
            { startedAt: { gte: from, lt: to } },
            { endedAt: { gte: from, lt: to } },
            { startedAt: { lt: to }, endedAt: null },
            {
              startedAt: { lt: from },
              endedAt: { gt: from },
            },
          ],
        },
      }),
      this.prisma.promiseToPay.count({
        where: {
          createdById: collectorId,
          createdAt: { gte: from, lt: to },
        },
      }),
    ]);

    const calls = sessions.filter((s) => s.channel === ContactChannel.CALL);
    const sms = sessions.filter((s) => s.channel === ContactChannel.SMS);
    const wa = sessions.filter((s) => s.channel === ContactChannel.WHATSAPP);
    const talkSeconds = calls.reduce((n, s) => n + (s.durationSeconds ?? 0), 0);
    const casesWorked = new Set(sessions.map((s) => s.caseId)).size;
    const hoursWorkedSeconds = sumSessionSecondsClipped(workSessions, from, to);

    return this.prisma.collectorDailyStat.upsert({
      where: {
        collectorId_date: { collectorId, date: from },
      },
      create: {
        collectorId,
        date: from,
        callsCount: calls.length,
        talkSeconds,
        smsCount: sms.length,
        whatsappCount: wa.length,
        followUpsCount: sessions.length,
        casesWorked,
        ptpCount: ptps,
        hoursWorkedSeconds,
      },
      update: {
        callsCount: calls.length,
        talkSeconds,
        smsCount: sms.length,
        whatsappCount: wa.length,
        followUpsCount: sessions.length,
        casesWorked,
        ptpCount: ptps,
        hoursWorkedSeconds,
      },
    });
  }

  async rollAllCollectorsDaily(day = new Date()) {
    const collectors = await this.prisma.user.findMany({
      where: {
        role: { in: [UserRole.COLLECTOR, UserRole.COLLECTIONS_ADMIN] },
        isActive: true,
      },
      select: { id: true },
    });
    const rows = [];
    for (const c of collectors) {
      rows.push(await this.rollDailyStatsForCollector(c.id, day));
    }
    return { date: startOfUtcDay(day), rolled: rows.length, stats: rows };
  }

  /**
   * Collector performance for day/month/year (and arbitrary range).
   * Prefer materialized daily stats when available; compute live as fallback.
   */
  async collectorPerformance(query: CollectorPerformanceQuery, actor: AuthUser) {
    if (
      actor.role !== UserRole.SUPER_ADMIN &&
      actor.role !== UserRole.COLLECTIONS_ADMIN &&
      actor.role !== UserRole.COLLECTOR &&
      actor.role !== UserRole.MASTER_COLLECTOR
    ) {
      throw new ForbiddenException();
    }

    const period = (query.period ?? 'day').toLowerCase();
    const { from, to } = parseRangeForPeriod(query, period);

    let collectorIds: string[];
    if (actor.role === UserRole.COLLECTOR) {
      collectorIds = [actor.userId];
    } else if (actor.role === UserRole.MASTER_COLLECTOR) {
      const team = await this.prisma.user.findMany({
        where: {
          isActive: true,
          OR: [
            { id: actor.userId },
            { managedById: actor.userId, role: UserRole.COLLECTOR },
          ],
        },
        select: { id: true },
      });
      collectorIds = query.collectorId
        ? team.some((t) => t.id === query.collectorId)
          ? [query.collectorId]
          : []
        : team.map((u) => u.id);
      if (query.collectorId && collectorIds.length === 0) {
        throw new ForbiddenException('Collector is not on your team');
      }
    } else if (query.collectorId) {
      collectorIds = [query.collectorId];
    } else {
      const list = await this.prisma.user.findMany({
        where: {
          role: {
            in: [
              UserRole.COLLECTOR,
              UserRole.MASTER_COLLECTOR,
              UserRole.COLLECTIONS_ADMIN,
            ],
          },
          isActive: true,
          tenantId: null,
        },
        select: { id: true },
      });
      collectorIds = list.map((u) => u.id);
    }

    // Ensure today is rolled for these collectors (cheap upsert)
    const today = new Date();
    for (const id of collectorIds) {
      await this.rollDailyStatsForCollector(id, today);
    }

    const stats = await this.prisma.collectorDailyStat.findMany({
      where: {
        collectorId: { in: collectorIds },
        date: { gte: startOfUtcDay(from), lt: to },
      },
      orderBy: { date: 'asc' },
    });

    const users = await this.prisma.user.findMany({
      where: { id: { in: collectorIds } },
      select: { id: true, fullName: true, email: true, phone: true, role: true },
    });
    const nameById = new Map(users.map((u) => [u.id, u]));

    // Aggregate per collector
    const byCollectorMap = new Map<
      string,
      {
        collectorId: string;
        collectorName: string;
        email: string;
        callsCount: number;
        talkSeconds: number;
        smsCount: number;
        whatsappCount: number;
        followUpsCount: number;
        casesWorked: number;
        ptpCount: number;
        hoursWorkedSeconds: number;
        daysActive: number;
      }
    >();

    for (const s of stats) {
      const u = nameById.get(s.collectorId);
      const row = byCollectorMap.get(s.collectorId) ?? {
        collectorId: s.collectorId,
        collectorName: u?.fullName ?? s.collectorId,
        email: u?.email ?? '',
        callsCount: 0,
        talkSeconds: 0,
        smsCount: 0,
        whatsappCount: 0,
        followUpsCount: 0,
        casesWorked: 0,
        ptpCount: 0,
        hoursWorkedSeconds: 0,
        daysActive: 0,
      };
      row.callsCount += s.callsCount;
      row.talkSeconds += s.talkSeconds;
      row.smsCount += s.smsCount;
      row.whatsappCount += s.whatsappCount;
      row.followUpsCount += s.followUpsCount;
      row.casesWorked += s.casesWorked;
      row.ptpCount += s.ptpCount;
      row.hoursWorkedSeconds += s.hoursWorkedSeconds;
      if (s.followUpsCount > 0 || s.hoursWorkedSeconds > 0) row.daysActive += 1;
      byCollectorMap.set(s.collectorId, row);
    }

    const byCollector = [...byCollectorMap.values()].map((r) => ({
      ...r,
      hoursWorked: Number((r.hoursWorkedSeconds / 3600).toFixed(2)),
      avgCallSeconds:
        r.callsCount > 0 ? Math.round(r.talkSeconds / r.callsCount) : null,
      talkHours: Number((r.talkSeconds / 3600).toFixed(2)),
    }));

    // Time series buckets (for charts)
    const series = groupStatsByPeriod(stats, period, nameById);

    return {
      period: { kind: period, from, to },
      byCollector,
      series,
      totals: byCollector.reduce(
        (acc, r) => ({
          followUpsCount: acc.followUpsCount + r.followUpsCount,
          callsCount: acc.callsCount + r.callsCount,
          talkSeconds: acc.talkSeconds + r.talkSeconds,
          hoursWorkedSeconds: acc.hoursWorkedSeconds + r.hoursWorkedSeconds,
          ptpCount: acc.ptpCount + r.ptpCount,
        }),
        {
          followUpsCount: 0,
          callsCount: 0,
          talkSeconds: 0,
          hoursWorkedSeconds: 0,
          ptpCount: 0,
        },
      ),
    };
  }

  private async loadCaseForWork(caseId: string, actor: AuthUser) {
    const c = await this.prisma.collectionCase.findUnique({
      where: { id: caseId },
      include: {
        customer: { select: { id: true, fullName: true, phone: true } },
      },
    });
    if (!c) throw new NotFoundException('Case not found');
    this.assertCanViewCase(c, actor);
    if (actor.role === UserRole.COLLECTOR && c.assignedToId !== actor.userId) {
      throw new ForbiddenException('Case not assigned to you');
    }
    // Sellers cannot start managed contacts
    if (actor.tenantId) {
      throw new ForbiddenException('Only platform collectors can start contacts');
    }
    return c;
  }

  private assertCanWorkCase(actor: AuthUser) {
    if (
      actor.role !== UserRole.COLLECTOR &&
      actor.role !== UserRole.MASTER_COLLECTOR &&
      actor.role !== UserRole.COLLECTIONS_ADMIN &&
      actor.role !== UserRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException('Collectors only');
    }
  }

  async assign(id: string, dto: AssignCaseDto, actor: AuthUser) {
    const isMaster = actor.role === UserRole.MASTER_COLLECTOR;
    if (!isMaster) this.assertPlatformAdmin(actor);

    const c = await this.prisma.collectionCase.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Case not found');

    const collector = await this.prisma.user.findFirst({
      where: {
        id: dto.assignedToId,
        isActive: true,
        role: {
          in: [
            UserRole.COLLECTOR,
            UserRole.MASTER_COLLECTOR,
            UserRole.COLLECTIONS_ADMIN,
          ],
        },
        tenantId: null,
        ...(isMaster
          ? {
              OR: [
                { id: actor.userId },
                { managedById: actor.userId, role: UserRole.COLLECTOR },
              ],
            }
          : {}),
      },
    });
    if (!collector) {
      throw new BadRequestException(
        isMaster
          ? 'assignedToId must be you or a collector on your team'
          : 'assignedToId must be an active platform collector',
      );
    }

    const updated = await this.prisma.collectionCase.update({
      where: { id },
      data: {
        assignedToId: collector.id,
        assignedAt: new Date(),
        status:
          c.status === CollectionCaseStatus.OPEN
            ? CollectionCaseStatus.IN_PROGRESS
            : c.status,
      },
      include: caseInclude,
    });
    return mapCase(updated);
  }

  async unassign(id: string, actor: AuthUser) {
    this.assertPlatformAdmin(actor);
    const c = await this.prisma.collectionCase.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Case not found');
    const updated = await this.prisma.collectionCase.update({
      where: { id },
      data: {
        assignedToId: null,
        assignedAt: null,
        status:
          c.status === CollectionCaseStatus.IN_PROGRESS
            ? CollectionCaseStatus.OPEN
            : c.status,
      },
      include: caseInclude,
    });
    return mapCase(updated);
  }

  async listCollectors(actor: AuthUser) {
    const staffSelect = {
      id: true,
      email: true,
      fullName: true,
      role: true,
      phone: true,
      isActive: true,
      lastLoginAt: true,
      createdAt: true,
      managedById: true,
      managedBy: { select: { id: true, fullName: true, email: true } },
      _count: {
        select: {
          assignedCollectionCases: {
            where: { status: { in: OPEN_STATUSES } },
          },
          managedCollectors: true,
        },
      },
    } as const;

    if (actor.role === UserRole.MASTER_COLLECTOR) {
      return this.prisma.user.findMany({
        where: {
          tenantId: null,
          OR: [
            { id: actor.userId },
            { managedById: actor.userId, role: UserRole.COLLECTOR },
          ],
        },
        select: staffSelect,
        orderBy: [{ role: 'asc' }, { fullName: 'asc' }],
      });
    }

    this.assertPlatformAdmin(actor);
    return this.prisma.user.findMany({
      where: {
        tenantId: null,
        role: {
          in: [
            UserRole.COLLECTOR,
            UserRole.MASTER_COLLECTOR,
            UserRole.COLLECTIONS_ADMIN,
          ],
        },
      },
      select: staffSelect,
      orderBy: [{ role: 'asc' }, { fullName: 'asc' }],
    });
  }

  async createPlatformStaff(dto: CreatePlatformStaffDto, actor: AuthUser) {
    const isMaster = actor.role === UserRole.MASTER_COLLECTOR;
    if (!isMaster) this.assertPlatformAdmin(actor);

    if (actor.role === UserRole.COLLECTIONS_ADMIN && dto.role === 'COLLECTIONS_ADMIN') {
      throw new ForbiddenException('Only SUPER_ADMIN can create COLLECTIONS_ADMIN');
    }
    if (isMaster && dto.role !== 'COLLECTOR') {
      throw new ForbiddenException('Master collectors may only create COLLECTOR accounts');
    }

    let managedById: string | null = null;
    if (dto.role === 'COLLECTOR') {
      if (isMaster) {
        managedById = actor.userId;
      } else if (dto.managedById) {
        const master = await this.prisma.user.findFirst({
          where: {
            id: dto.managedById,
            role: UserRole.MASTER_COLLECTOR,
            isActive: true,
            tenantId: null,
          },
        });
        if (!master) {
          throw new BadRequestException('managedById must be an active MASTER_COLLECTOR');
        }
        managedById = master.id;
      }
    } else if (dto.managedById) {
      throw new BadRequestException('Only COLLECTOR accounts can be assigned to a master');
    }

    const email = dto.email.toLowerCase().trim();
    const temporaryPassword = dto.password || generateTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);
    let created;
    try {
      created = await this.prisma.user.create({
        data: {
          email,
          fullName: dto.fullName,
          passwordHash,
          role: dto.role as UserRole,
          tenantId: null,
          phone: dto.phone?.trim() || null,
          managedById,
        },
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          phone: true,
          isActive: true,
          managedById: true,
          createdAt: true,
        },
      });
    } catch {
      throw new BadRequestException('Could not create user (email may exist)');
    }

    const emailSent = await this.email.sendCollectorWelcome({
      to: email,
      fullName: dto.fullName,
      email,
      temporaryPassword,
      roleLabel: PLATFORM_STAFF_ROLE_LABELS[dto.role] ?? dto.role,
    });
    if (!emailSent) {
      this.logger.warn(
        `Welcome email not delivered for ${email} — credentials returned in API for admin to share`,
      );
    }

    return { ...created, temporaryPassword, emailSent };
  }

  async assignCollectorMaster(
    collectorId: string,
    dto: AssignCollectorMasterDto,
    actor: AuthUser,
  ) {
    this.assertPlatformAdmin(actor);

    const collector = await this.prisma.user.findFirst({
      where: {
        id: collectorId,
        role: UserRole.COLLECTOR,
        tenantId: null,
      },
    });
    if (!collector) {
      throw new NotFoundException('Collector not found');
    }

    let managedById: string | null = null;
    if (dto.masterCollectorId) {
      const master = await this.prisma.user.findFirst({
        where: {
          id: dto.masterCollectorId,
          role: UserRole.MASTER_COLLECTOR,
          isActive: true,
          tenantId: null,
        },
      });
      if (!master) {
        throw new BadRequestException('masterCollectorId must be an active MASTER_COLLECTOR');
      }
      managedById = master.id;
    }

    return this.prisma.user.update({
      where: { id: collectorId },
      data: { managedById },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        phone: true,
        isActive: true,
        managedById: true,
        managedBy: { select: { id: true, fullName: true, email: true } },
      },
    });
  }

  async updateMyPhone(dto: UpdateCollectorPhoneDto, actor: AuthUser) {
    if (!PLATFORM_ROLES.has(actor.role) || actor.role === UserRole.SUPER_ADMIN) {
      // Super admin can set phone too if acting as collector tooling
    }
    if (actor.tenantId) {
      throw new ForbiddenException('Seller staff use a different profile path');
    }
    return this.prisma.user.update({
      where: { id: actor.userId },
      data: { phone: dto.phone.trim() },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        phone: true,
      },
    });
  }

  private assertPlatformAdmin(actor: AuthUser) {
    if (
      actor.role !== UserRole.SUPER_ADMIN &&
      actor.role !== UserRole.COLLECTIONS_ADMIN
    ) {
      throw new ForbiddenException('Platform collections admin required');
    }
  }

  private assertCanViewCase(
    row: { tenantId: string; assignedToId: string | null },
    actor: AuthUser,
  ) {
    if (actor.role === UserRole.SUPER_ADMIN || actor.role === UserRole.COLLECTIONS_ADMIN) {
      return;
    }
    if (actor.role === UserRole.COLLECTOR) {
      if (row.assignedToId !== actor.userId) {
        throw new ForbiddenException('Case not assigned to you');
      }
      return;
    }
    if (actor.tenantId && row.tenantId === actor.tenantId) return;
    throw new ForbiddenException('Cannot view this case');
  }
}

const caseInclude = {
  tenant: { select: { id: true, name: true } },
  customer: {
    select: {
      id: true,
      fullName: true,
      phone: true,
      nationalId: true,
      idCardPhotoUrl: true,
      selfiePhotoUrl: true,
      occupation: true,
      employerName: true,
      employerPhone: true,
      monthlyIncome: true,
    },
  },
  device: {
    select: { id: true, imei: true, make: true, model: true, status: true },
  },
  loan: { select: { id: true, currency: true, status: true } },
  installment: {
    select: {
      id: true,
      sequence: true,
      dueDate: true,
      amount: true,
      amountPaid: true,
      status: true,
    },
  },
  assignedTo: {
    select: { id: true, fullName: true, email: true, phone: true, role: true },
  },
  referredBy: { select: { id: true, fullName: true, role: true } },
} as const;

function mapCase(row: any) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    companyName: row.tenant?.name ?? null,
    company: row.tenant ?? null,
    loanId: row.loanId,
    customerId: row.customerId,
    customerName: row.customer?.fullName ?? null,
    customerPhone: row.customer?.phone ?? null,
    customerNationalId: row.customer?.nationalId ?? null,
    idCardPhotoUrl: row.customer?.idCardPhotoUrl ?? null,
    selfiePhotoUrl: row.customer?.selfiePhotoUrl ?? null,
    occupation: row.customer?.occupation ?? null,
    employerName: row.customer?.employerName ?? null,
    employerPhone: row.customer?.employerPhone ?? null,
    monthlyIncome: row.customer?.monthlyIncome ?? null,
    deviceId: row.deviceId,
    deviceImei: row.device?.imei ?? null,
    deviceModel:
      [row.device?.make, row.device?.model].filter(Boolean).join(' ') || null,
    deviceStatus: row.device?.status ?? null,
    installmentId: row.installmentId,
    installmentSequence: row.installment?.sequence ?? null,
    dueDate: row.installment?.dueDate ?? null,
    status: row.status,
    source: row.source,
    referredById: row.referredById ?? null,
    referredBy: row.referredBy ?? null,
    referredAt: row.referredAt ?? null,
    referralNote: row.referralNote ?? null,
    daysOverdue: row.daysOverdue,
    amountDue: row.amountDue,
    currency: row.currency,
    followUpCount: row.followUpCount,
    assignedToId: row.assignedToId,
    assignedTo: row.assignedTo ?? null,
    assignedAt: row.assignedAt,
    lastContactedAt: row.lastContactedAt,
    nextActionAt: row.nextActionAt,
    closedAt: row.closedAt,
    closedReason: row.closedReason,
    extensionApplied: row.extensionApplied ?? false,
    penaltyInterestReductionEnabled: row.penaltyInterestReductionEnabled ?? false,
    penaltyInterestAmount: row.penaltyInterestAmount ?? 0,
    waiverValidUntil: row.waiverValidUntil ?? null,
    originalOverdueAmount: row.originalOverdueAmount ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function daysBetween(from: Date, to: Date) {
  const DAY_MS = 24 * 60 * 60 * 1000;
  return Math.round((to.getTime() - from.getTime()) / DAY_MS);
}

const toCents = (d: Prisma.Decimal | number | string) =>
  Math.round(Number(d) * 100);

/**
 * Re-derives, per CONFIRMED payment, which installment(s) it landed on and
 * whether it was FULL/PARTIAL — by replaying the same FIFO waterfall that
 * PaymentsService.recompute() uses to settle installments, but incrementally
 * per payment (in receivedAt order) instead of as one pooled sum. Payment
 * rows have no direct installment FK, so this is the only way to attribute
 * a payment to a due date for the "days early/late" display.
 */
function buildRepaymentHistory(
  installments: {
    sequence: number;
    dueDate: Date;
    amount: Prisma.Decimal;
  }[],
  payments: {
    id: string;
    orderReference: string | null;
    providerRef: string | null;
    amount: Prisma.Decimal;
    method: string;
    receivedAt: Date;
  }[],
) {
  const remainingCents = installments.map((inst) => toCents(inst.amount));
  let cursor = 0;

  return payments.map((payment) => {
    let paymentCents = toCents(payment.amount);
    let coveredInstallment = installments[cursor] ?? null;
    let fullyCoveredFirstHit = false;

    while (paymentCents > 0 && cursor < installments.length) {
      const need = remainingCents[cursor];
      const applied = Math.min(paymentCents, need);
      remainingCents[cursor] -= applied;
      paymentCents -= applied;
      if (coveredInstallment === installments[cursor]) {
        fullyCoveredFirstHit = remainingCents[cursor] === 0;
      }
      if (remainingCents[cursor] === 0) cursor += 1;
    }

    return {
      id: payment.id,
      orderReference: payment.orderReference ?? payment.providerRef ?? payment.id,
      receivedAt: payment.receivedAt,
      amount: payment.amount,
      method: payment.method,
      classification: fullyCoveredFirstHit ? 'FULL' : 'PARTIAL',
      installmentSequence: coveredInstallment?.sequence ?? null,
      dueDate: coveredInstallment?.dueDate ?? null,
      daysEarly: coveredInstallment
        ? daysBetween(payment.receivedAt, coveredInstallment.dueDate)
        : null,
    };
  });
}

function packageCodeForCount(count: number): CollectionsPackage | null {
  if (count >= 1 && count <= 29) return CollectionsPackage.STARTER;
  if (count >= 30 && count <= 44) return CollectionsPackage.GROWTH;
  if (count >= 45 && count <= 55) return CollectionsPackage.BUSINESS;
  return null;
}

function buildLaunchUrl(
  channel: ContactChannel,
  phone: string,
  body?: string,
): string {
  const digits = phone.replace(/[^\d+]/g, '');
  const national = digits.replace(/^\+/, '');
  switch (channel) {
    case ContactChannel.CALL:
      return `tel:${digits}`;
    case ContactChannel.SMS: {
      const text = body ? `?body=${encodeURIComponent(body)}` : '';
      return `sms:${digits}${text}`;
    }
    case ContactChannel.WHATSAPP: {
      const text = body ? `?text=${encodeURIComponent(body)}` : '';
      return `https://wa.me/${national}${text}`;
    }
    default:
      return `tel:${digits}`;
  }
}

function parseRange(query: { from?: string; to?: string }) {
  const now = new Date();
  const from = query.from
    ? new Date(query.from)
    : new Date(now.getFullYear(), now.getMonth(), 1);
  const to = query.to ? new Date(query.to) : new Date(now.getTime() + 86400000);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw new BadRequestException('Invalid from/to date');
  }
  return { from, to };
}

function startOfUtcDay(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function parseRangeForPeriod(
  query: { from?: string; to?: string },
  period: string,
) {
  const now = new Date();
  if (query.from || query.to) return parseRange(query);
  if (period === 'year') {
    const from = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    const to = new Date(Date.UTC(now.getUTCFullYear() + 1, 0, 1));
    return { from, to };
  }
  if (period === 'month') {
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    return { from, to };
  }
  // day
  const from = startOfUtcDay(now);
  const to = new Date(from.getTime() + 86_400_000);
  return { from, to };
}

function sumSessionSeconds(
  sessions: { startedAt: Date; endedAt: Date | null }[],
  now: Date,
) {
  let total = 0;
  for (const s of sessions) {
    const end = s.endedAt ?? now;
    total += Math.max(0, Math.floor((end.getTime() - s.startedAt.getTime()) / 1000));
  }
  return total;
}

function sumSessionSecondsClipped(
  sessions: { startedAt: Date; endedAt: Date | null }[],
  from: Date,
  to: Date,
) {
  let total = 0;
  const now = new Date();
  for (const s of sessions) {
    const start = s.startedAt < from ? from : s.startedAt;
    const endRaw = s.endedAt ?? now;
    const end = endRaw > to ? to : endRaw;
    if (end > start) {
      total += Math.floor((end.getTime() - start.getTime()) / 1000);
    }
  }
  return total;
}

function csvEscape(value: string) {
  if (value == null) return '';
  const s = String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function normalizePhoneDigits(phone: string) {
  return phone.replace(/\D/g, '');
}

/** Match last 9 digits (TZ mobile) or full digit string. */
function phonesMatch(a: string, b: string) {
  if (!a || !b) return false;
  if (a === b) return true;
  const ta = a.slice(-9);
  const tb = b.slice(-9);
  return ta.length >= 9 && ta === tb;
}

function groupStatsByPeriod(
  stats: {
    collectorId: string;
    date: Date;
    followUpsCount: number;
    callsCount: number;
    talkSeconds: number;
    hoursWorkedSeconds: number;
    ptpCount: number;
  }[],
  period: string,
  nameById: Map<string, { fullName: string }>,
) {
  const bucket = new Map<
    string,
    {
      bucket: string;
      followUpsCount: number;
      callsCount: number;
      talkSeconds: number;
      hoursWorkedSeconds: number;
      ptpCount: number;
    }
  >();

  for (const s of stats) {
    const d = new Date(s.date);
    let key: string;
    if (period === 'year') {
      key = String(d.getUTCFullYear());
    } else if (period === 'month') {
      key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    } else {
      key = d.toISOString().slice(0, 10);
    }
    const row = bucket.get(key) ?? {
      bucket: key,
      followUpsCount: 0,
      callsCount: 0,
      talkSeconds: 0,
      hoursWorkedSeconds: 0,
      ptpCount: 0,
    };
    row.followUpsCount += s.followUpsCount;
    row.callsCount += s.callsCount;
    row.talkSeconds += s.talkSeconds;
    row.hoursWorkedSeconds += s.hoursWorkedSeconds;
    row.ptpCount += s.ptpCount;
    bucket.set(key, row);
  }

  return [...bucket.values()]
    .sort((a, b) => a.bucket.localeCompare(b.bucket))
    .map((r) => ({
      ...r,
      hoursWorked: Number((r.hoursWorkedSeconds / 3600).toFixed(2)),
      avgCallSeconds:
        r.callsCount > 0 ? Math.round(r.talkSeconds / r.callsCount) : null,
    }));
}
