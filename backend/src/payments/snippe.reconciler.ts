import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PaymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { SnippeService } from '../integrations/snippe/snippe.service';
import { PaymentsService } from './payments.service';
import { PayoutsService } from './payouts.service';

/** Snippe payment intents expire after ~4h; stop polling after that. */
const POLL_WINDOW_MS = 5 * 60 * 60 * 1000;
/** Snippe allows 60 requests/min — stay well inside it. */
const MAX_POLLS_PER_RUN = 30;

/**
 * Polling safety net. Webhooks are the fast path, but they need a public HTTPS
 * URL (absent on a dev machine) and can be missed, so pending payments and
 * in-flight payouts are also reconciled against Snippe on a timer.
 */
@Injectable()
export class SnippeReconciler {
  private readonly logger = new Logger(SnippeReconciler.name);
  private busy = { payments: false, payouts: false };

  constructor(
    private readonly prisma: PrismaService,
    private readonly snippe: SnippeService,
    private readonly payments: PaymentsService,
    private readonly payouts: PayoutsService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async reconcilePayments() {
    if (!this.snippe.configured || this.busy.payments) return;
    this.busy.payments = true;
    try {
      const pending = await this.prisma.payment.findMany({
        where: {
          provider: 'SNIPPE',
          status: PaymentStatus.PENDING,
          providerRef: { not: null },
          createdAt: { gte: new Date(Date.now() - POLL_WINDOW_MS) },
        },
        orderBy: { createdAt: 'asc' },
        take: MAX_POLLS_PER_RUN,
      });
      for (const p of pending) {
        try {
          const res = await this.snippe.getPayment(p.providerRef!);
          await this.payments.syncSnippePayment(
            res,
            res as unknown as Prisma.InputJsonValue,
          );
        } catch (e) {
          this.logger.warn(
            `Payment ${p.orderReference} poll failed: ${(e as Error).message}`,
          );
        }
      }
    } finally {
      this.busy.payments = false;
    }
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async reconcilePayouts() {
    if (!this.snippe.configured || this.busy.payouts) return;
    this.busy.payouts = true;
    try {
      await this.payouts.sweep();
    } finally {
      this.busy.payouts = false;
    }
  }
}
