import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  CollectionCaseStatus,
  CollectionsSubscriptionStatus,
  DemoRequestStatus,
  DeviceStatus,
  InstallmentStatus,
  LoanStatus,
  PaymentStatus,
  PromiseToPayStatus,
  UserRole,
} from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../common/prisma/prisma.service';

const OPEN_CASE_STATUSES: CollectionCaseStatus[] = [
  CollectionCaseStatus.OPEN,
  CollectionCaseStatus.IN_PROGRESS,
  CollectionCaseStatus.PROMISED,
  CollectionCaseStatus.ESCALATED,
];

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async summary() {
    const p = this.prisma.scoped;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);

    const [
      total,
      active,
      locked,
      pending,
      released,
      customers,
      activeLoans,
      dueTodayInstallments,
      overdueInstallments,
      collectionsThisMonth,
      dueToday,
      overdueAccounts,
      lockedDevices,
    ] = await Promise.all([
      p.device.count(),
      p.device.count({ where: { status: DeviceStatus.ACTIVE } }),
      p.device.count({ where: { status: DeviceStatus.LOCKED } }),
      p.device.count({ where: { status: DeviceStatus.PENDING_ENROLLMENT } }),
      p.device.count({ where: { status: DeviceStatus.RELEASED } }),
      p.customer.count(),
      p.loan.count({ where: { status: LoanStatus.ACTIVE } }),
      p.installment.count({
        where: {
          status: InstallmentStatus.PENDING,
          dueDate: { gte: todayStart, lt: tomorrowStart },
        },
      }),
      p.installment.count({ where: { status: InstallmentStatus.OVERDUE } }),
      p.payment.aggregate({
        _sum: { amount: true },
        where: {
          status: PaymentStatus.CONFIRMED,
          receivedAt: { gte: monthStart },
        },
      }),
      p.installment.findMany({
        where: {
          status: InstallmentStatus.PENDING,
          dueDate: { gte: todayStart, lt: tomorrowStart },
        },
        orderBy: { dueDate: 'asc' },
        take: 8,
        include: {
          loan: { include: { customer: true, device: true } },
        },
      }),
      p.installment.findMany({
        where: { status: InstallmentStatus.OVERDUE },
        orderBy: { dueDate: 'asc' },
        take: 8,
        include: {
          loan: { include: { customer: true, device: true } },
        },
      }),
      p.device.findMany({
        where: { status: DeviceStatus.LOCKED },
        orderBy: { lockedAt: 'desc' },
        take: 8,
        include: { customer: true, loan: true },
      }),
    ]);

    const overdueAmount = overdueAccounts.reduce(
      (sum, i) => sum + Math.max(Number(i.amount) - Number(i.amountPaid), 0),
      0,
    );

    return {
      devices: { total, active, locked, pending, released },
      customers,
      activeLoans,
      dueTodayInstallments,
      overdueInstallments,
      collectionsThisMonth: Number(collectionsThisMonth._sum.amount ?? 0),
      overdueAmount,
      dueToday: dueToday.map((i) => this.installmentRow(i)),
      overdueAccounts: overdueAccounts.map((i) => this.installmentRow(i)),
      lockedDevices: lockedDevices.map((d) => ({
        id: d.id,
        imei: d.imei,
        model: [d.make, d.model].filter(Boolean).join(' ') || null,
        customerName: d.customer?.fullName ?? null,
        customerPhone: d.customer?.phone ?? null,
        lockedAt: d.lockedAt,
        loanStatus: d.loan?.status ?? null,
      })),
      series: await this.collectionsSeries(6),
    };
  }

  /**
   * Admin console home. Platform staff see network-wide KPIs; collectors see
   * their personal queue and today's work.
   */
  async platformSummary(actor: AuthUser) {
    if (
      actor.role !== UserRole.SUPER_ADMIN &&
      actor.role !== UserRole.COLLECTIONS_ADMIN &&
      actor.role !== UserRole.MASTER_COLLECTOR &&
      actor.role !== UserRole.COLLECTOR
    ) {
      throw new ForbiddenException();
    }

    if (actor.role === UserRole.COLLECTOR) {
      return this.collectorHome(actor.userId);
    }
    if (actor.role === UserRole.MASTER_COLLECTOR) {
      return this.masterHome(actor.userId);
    }
    return this.adminHome();
  }

  private async adminHome() {
    const dayStart = startOfUtcDay(new Date());
    const monthStart = new Date(
      Date.UTC(dayStart.getUTCFullYear(), dayStart.getUTCMonth(), 1),
    );

    const [
      companies,
      activeSubs,
      pendingSubs,
      pastDueSubs,
      demoNew,
      demoPipeline,
      openCases,
      unassignedCases,
      overdueBookAgg,
      collectorsActive,
      collectedMonth,
      ptpDueToday,
      ptpKeptMonth,
      lockedDevices,
      recentLeads,
      hotCases,
      attentionCompanies,
      topCollectors,
      paymentsSeries,
    ] = await Promise.all([
      this.prisma.tenant.count(),
      this.prisma.collectionsSubscription.count({
        where: { status: CollectionsSubscriptionStatus.ACTIVE },
      }),
      this.prisma.collectionsSubscription.count({
        where: { status: CollectionsSubscriptionStatus.PENDING },
      }),
      this.prisma.collectionsSubscription.count({
        where: { status: CollectionsSubscriptionStatus.PAST_DUE },
      }),
      this.prisma.demoRequest.count({
        where: { status: DemoRequestStatus.NEW },
      }),
      this.prisma.demoRequest.count({
        where: {
          status: {
            in: [DemoRequestStatus.CONTACTED, DemoRequestStatus.QUALIFIED],
          },
        },
      }),
      this.prisma.collectionCase.count({
        where: { status: { in: OPEN_CASE_STATUSES } },
      }),
      this.prisma.collectionCase.count({
        where: {
          status: { in: OPEN_CASE_STATUSES },
          assignedToId: null,
        },
      }),
      this.prisma.collectionCase.aggregate({
        where: { status: { in: OPEN_CASE_STATUSES } },
        _sum: { amountDue: true },
      }),
      this.prisma.user.count({
        where: {
          role: { in: [UserRole.COLLECTOR, UserRole.MASTER_COLLECTOR] },
          isActive: true,
          tenantId: null,
        },
      }),
      this.prisma.payment.aggregate({
        _sum: { amount: true },
        where: {
          status: PaymentStatus.CONFIRMED,
          receivedAt: { gte: monthStart },
        },
      }),
      this.prisma.promiseToPay.count({
        where: {
          status: PromiseToPayStatus.OPEN,
          dueDate: {
            gte: dayStart,
            lt: new Date(dayStart.getTime() + 86_400_000),
          },
        },
      }),
      this.prisma.promiseToPay.count({
        where: {
          status: PromiseToPayStatus.KEPT,
          updatedAt: { gte: monthStart },
        },
      }),
      this.prisma.device.count({ where: { status: DeviceStatus.LOCKED } }),
      this.prisma.demoRequest.findMany({
        where: {
          status: {
            in: [
              DemoRequestStatus.NEW,
              DemoRequestStatus.CONTACTED,
              DemoRequestStatus.QUALIFIED,
            ],
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 6,
        select: {
          id: true,
          companyName: true,
          fullName: true,
          phone: true,
          status: true,
          suggestedPackage: true,
          createdAt: true,
        },
      }),
      this.prisma.collectionCase.findMany({
        where: { status: { in: OPEN_CASE_STATUSES } },
        orderBy: [{ daysOverdue: 'desc' }, { amountDue: 'desc' }],
        take: 8,
        select: {
          id: true,
          daysOverdue: true,
          amountDue: true,
          currency: true,
          status: true,
          assignedToId: true,
          tenant: { select: { name: true } },
          customer: { select: { fullName: true, phone: true } },
          assignedTo: { select: { fullName: true } },
        },
      }),
      this.prisma.collectionsSubscription.findMany({
        where: {
          status: {
            in: [
              CollectionsSubscriptionStatus.PAST_DUE,
              CollectionsSubscriptionStatus.PENDING,
              CollectionsSubscriptionStatus.SUSPENDED,
            ],
          },
        },
        orderBy: { updatedAt: 'desc' },
        take: 6,
        select: {
          id: true,
          status: true,
          packageCode: true,
          tenant: { select: { id: true, name: true } },
        },
      }),
      this.collectorDailyLeaders(dayStart, 5),
      this.platformCollectionsSeries(6),
    ]);

    return {
      view: 'admin' as const,
      kpis: {
        companies,
        activeSubscriptions: activeSubs,
        pendingSubscriptions: pendingSubs,
        pastDueSubscriptions: pastDueSubs,
        demoNew,
        demoPipeline,
        openCases,
        unassignedCases,
        overdueBook: Number(overdueBookAgg._sum.amountDue ?? 0),
        collectorsActive,
        collectedThisMonth: Number(collectedMonth._sum.amount ?? 0),
        ptpDueToday,
        ptpKeptThisMonth: ptpKeptMonth,
        lockedDevices,
      },
      recentLeads,
      hotCases: hotCases.map((c) => ({
        id: c.id,
        companyName: c.tenant.name,
        customerName: c.customer?.fullName ?? null,
        customerPhone: c.customer?.phone ?? null,
        daysOverdue: c.daysOverdue,
        amountDue: Number(c.amountDue),
        currency: c.currency,
        status: c.status,
        assignedTo: c.assignedTo?.fullName ?? null,
      })),
      attentionCompanies: attentionCompanies.map((s) => ({
        tenantId: s.tenant.id,
        name: s.tenant.name,
        status: s.status,
        packageCode: s.packageCode,
      })),
      topCollectors,
      series: paymentsSeries,
    };
  }

  private async masterHome(masterId: string) {
    const team = await this.prisma.user.findMany({
      where: {
        OR: [
          { id: masterId },
          { managedById: masterId, role: UserRole.COLLECTOR },
        ],
      },
      select: { id: true },
    });
    const ids = team.map((t) => t.id);
    const dayStart = startOfUtcDay(new Date());

    const [openCases, unassignedCases, overdueBookAgg, topCollectors, hotCases] =
      await Promise.all([
        this.prisma.collectionCase.count({
          where: {
            status: { in: OPEN_CASE_STATUSES },
            assignedToId: { in: ids },
          },
        }),
        this.prisma.collectionCase.count({
          where: {
            status: { in: OPEN_CASE_STATUSES },
            assignedToId: null,
          },
        }),
        this.prisma.collectionCase.aggregate({
          where: {
            status: { in: OPEN_CASE_STATUSES },
            assignedToId: { in: ids },
          },
          _sum: { amountDue: true },
        }),
        this.collectorDailyLeaders(dayStart, 5, ids),
        this.prisma.collectionCase.findMany({
          where: {
            status: { in: OPEN_CASE_STATUSES },
            OR: [{ assignedToId: { in: ids } }, { assignedToId: null }],
          },
          orderBy: [{ daysOverdue: 'desc' }],
          take: 8,
          select: {
            id: true,
            daysOverdue: true,
            amountDue: true,
            currency: true,
            status: true,
            tenant: { select: { name: true } },
            customer: { select: { fullName: true, phone: true } },
            assignedTo: { select: { fullName: true } },
          },
        }),
      ]);

    return {
      view: 'master' as const,
      kpis: {
        teamSize: ids.length,
        openCases,
        unassignedCases,
        overdueBook: Number(overdueBookAgg._sum.amountDue ?? 0),
        followUpsToday: topCollectors.reduce((s, c) => s + c.followUpsCount, 0),
        callsToday: topCollectors.reduce((s, c) => s + c.callsCount, 0),
        ptpToday: topCollectors.reduce((s, c) => s + c.ptpCount, 0),
      },
      hotCases: hotCases.map((c) => ({
        id: c.id,
        companyName: c.tenant.name,
        customerName: c.customer?.fullName ?? null,
        customerPhone: c.customer?.phone ?? null,
        daysOverdue: c.daysOverdue,
        amountDue: Number(c.amountDue),
        currency: c.currency,
        status: c.status,
        assignedTo: c.assignedTo?.fullName ?? null,
      })),
      topCollectors,
      series: [] as Array<{ label: string; amount: number }>,
      recentLeads: [],
      attentionCompanies: [],
    };
  }

  private async collectorHome(collectorId: string) {
    const dayStart = startOfUtcDay(new Date());
    const dayEnd = new Date(dayStart.getTime() + 86_400_000);

    const [openCases, myCases, dayStat, ptpDue] = await Promise.all([
      this.prisma.collectionCase.count({
        where: {
          assignedToId: collectorId,
          status: { in: OPEN_CASE_STATUSES },
        },
      }),
      this.prisma.collectionCase.findMany({
        where: {
          assignedToId: collectorId,
          status: { in: OPEN_CASE_STATUSES },
        },
        orderBy: [{ daysOverdue: 'desc' }],
        take: 8,
        select: {
          id: true,
          daysOverdue: true,
          amountDue: true,
          currency: true,
          status: true,
          tenant: { select: { name: true } },
          customer: { select: { fullName: true, phone: true } },
        },
      }),
      this.prisma.collectorDailyStat.findUnique({
        where: {
          collectorId_date: { collectorId, date: dayStart },
        },
      }),
      this.prisma.promiseToPay.count({
        where: {
          createdById: collectorId,
          status: PromiseToPayStatus.OPEN,
          dueDate: { gte: dayStart, lt: dayEnd },
        },
      }),
    ]);

    return {
      view: 'collector' as const,
      kpis: {
        openCases,
        followUpsToday: dayStat?.followUpsCount ?? 0,
        callsToday: dayStat?.callsCount ?? 0,
        smsToday: dayStat?.smsCount ?? 0,
        whatsappToday: dayStat?.whatsappCount ?? 0,
        ptpDueToday: ptpDue,
        hoursWorked: Number(((dayStat?.hoursWorkedSeconds ?? 0) / 3600).toFixed(2)),
        overdueBook: myCases.reduce((s, c) => s + Number(c.amountDue), 0),
      },
      hotCases: myCases.map((c) => ({
        id: c.id,
        companyName: c.tenant.name,
        customerName: c.customer?.fullName ?? null,
        customerPhone: c.customer?.phone ?? null,
        daysOverdue: c.daysOverdue,
        amountDue: Number(c.amountDue),
        currency: c.currency,
        status: c.status,
        assignedTo: null as string | null,
      })),
      topCollectors: [],
      series: [] as Array<{ label: string; amount: number }>,
      recentLeads: [],
      attentionCompanies: [],
    };
  }

  private async collectorDailyLeaders(
    dayStart: Date,
    take: number,
    collectorIds?: string[],
  ) {
    const stats = await this.prisma.collectorDailyStat.findMany({
      where: {
        date: dayStart,
        ...(collectorIds ? { collectorId: { in: collectorIds } } : {}),
      },
      orderBy: [{ followUpsCount: 'desc' }, { callsCount: 'desc' }],
      take,
    });
    if (stats.length === 0) return [];

    const users = await this.prisma.user.findMany({
      where: { id: { in: stats.map((s) => s.collectorId) } },
      select: { id: true, fullName: true, email: true },
    });
    const byId = new Map(users.map((u) => [u.id, u]));

    return stats.map((s) => ({
      collectorId: s.collectorId,
      collectorName: byId.get(s.collectorId)?.fullName ?? s.collectorId,
      email: byId.get(s.collectorId)?.email ?? '',
      followUpsCount: s.followUpsCount,
      callsCount: s.callsCount,
      smsCount: s.smsCount,
      whatsappCount: s.whatsappCount,
      ptpCount: s.ptpCount,
      hoursWorked: Number((s.hoursWorkedSeconds / 3600).toFixed(2)),
    }));
  }

  private async platformCollectionsSeries(months: number) {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);

    const payments = await this.prisma.payment.findMany({
      where: {
        status: PaymentStatus.CONFIRMED,
        receivedAt: { gte: start },
      },
      select: { amount: true, receivedAt: true },
    });

    const buckets: { label: string; amount: number }[] = [];
    for (let i = 0; i < months; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - (months - 1) + i, 1);
      buckets.push({
        label: d.toLocaleString('en', { month: 'short' }),
        amount: 0,
      });
    }
    for (const pay of payments) {
      const d = pay.receivedAt;
      const idx =
        (d.getFullYear() - start.getFullYear()) * 12 +
        (d.getMonth() - start.getMonth());
      if (idx >= 0 && idx < buckets.length) {
        buckets[idx].amount += Number(pay.amount);
      }
    }
    return buckets;
  }

  private installmentRow(i: any) {
    return {
      id: i.id,
      sequence: i.sequence,
      dueDate: i.dueDate,
      amount: Number(i.amount),
      amountPaid: Number(i.amountPaid),
      amountDue: Math.max(Number(i.amount) - Number(i.amountPaid), 0),
      status: i.status,
      loanId: i.loanId,
      customerName: i.loan?.customer?.fullName ?? null,
      customerPhone: i.loan?.customer?.phone ?? null,
      deviceId: i.loan?.device?.id ?? null,
      deviceImei: i.loan?.device?.imei ?? null,
      deviceModel: i.loan?.device
        ? [i.loan.device.make, i.loan.device.model].filter(Boolean).join(' ') || null
        : null,
    };
  }

  /** Confirmed-payment totals for the last N calendar months (oldest first). */
  private async collectionsSeries(months: number) {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);

    const payments = await this.prisma.scoped.payment.findMany({
      where: {
        status: PaymentStatus.CONFIRMED,
        receivedAt: { gte: start },
      },
      select: { amount: true, receivedAt: true },
    });

    const buckets: { label: string; amount: number }[] = [];
    for (let i = 0; i < months; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - (months - 1) + i, 1);
      buckets.push({
        label: d.toLocaleString('en', { month: 'short' }),
        amount: 0,
      });
    }
    for (const pay of payments) {
      const d = pay.receivedAt;
      const idx =
        (d.getFullYear() - start.getFullYear()) * 12 +
        (d.getMonth() - start.getMonth());
      if (idx >= 0 && idx < buckets.length) {
        buckets[idx].amount += Number(pay.amount);
      }
    }
    return buckets;
  }
}

function startOfUtcDay(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
