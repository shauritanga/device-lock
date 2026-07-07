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

    const [
      total,
      active,
      locked,
      pending,
      released,
      customers,
      activeLoans,
      overdueInstallments,
      collectionsThisMonth,
    ] = await Promise.all([
      p.device.count(),
      p.device.count({ where: { status: DeviceStatus.ACTIVE } }),
      p.device.count({ where: { status: DeviceStatus.LOCKED } }),
      p.device.count({ where: { status: DeviceStatus.PENDING_ENROLLMENT } }),
      p.device.count({ where: { status: DeviceStatus.RELEASED } }),
      p.customer.count(),
      p.loan.count({ where: { status: LoanStatus.ACTIVE } }),
      p.installment.count({ where: { status: InstallmentStatus.OVERDUE } }),
      p.payment.aggregate({
        _sum: { amount: true },
        where: {
          status: PaymentStatus.CONFIRMED,
          receivedAt: { gte: monthStart },
        },
      }),
    ]);

    return {
      devices: { total, active, locked, pending, released },
      customers,
      activeLoans,
      overdueInstallments,
      collectionsThisMonth: Number(collectionsThisMonth._sum.amount ?? 0),
      series: await this.collectionsSeries(6),
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
