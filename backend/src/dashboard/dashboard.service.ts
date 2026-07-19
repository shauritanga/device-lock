import { Injectable } from '@nestjs/common';
import {
  DeviceStatus,
  InstallmentStatus,
  LoanStatus,
  PaymentStatus,
} from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';

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
