import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  RawBodyRequest,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { PaymentsService } from '../payments/payments.service';
import { PayoutsService } from '../payments/payouts.service';
import {
  SnippePayment,
  SnippePayout,
  SnippeService,
} from '../integrations/snippe/snippe.service';
import { PrismaService } from '../common/prisma/prisma.service';

interface SnippeWebhook {
  id?: string;
  type?: string;
  data?: Record<string, any>;
}

@Public()
@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    private readonly payments: PaymentsService,
    private readonly payouts: PayoutsService,
    private readonly snippe: SnippeService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('voice')
  @HttpCode(200)
  async handleVoice(@Body() body: Record<string, any>) {
    const deviceId = String(body.deviceId ?? '').trim();
    if (!deviceId) return { received: true, result: 'ignored' };

    const device = await this.prisma.device.findUnique({
      where: { id: deviceId },
      select: { tenantId: true },
    });
    if (!device) return { received: true, result: 'unknown_device' };

    await this.prisma.deviceEvent.create({
      data: {
        tenantId: device.tenantId,
        deviceId,
        type: 'VOICE_CALLBACK',
        metadata: body as Prisma.InputJsonValue,
      },
    });
    return { received: true, result: 'recorded' };
  }

  /**
   * Snippe callback (docs.snippe.sh/docs/2026-01-25/webhooks) for both
   * collections (payment.*) and disbursements (payout.*).
   *
   * Trust model: the HMAC signature gates the request (mandatory in
   * production), and the outcome is then re-read from Snippe's own API so a
   * forged or replayed body can never confirm money or unlock a phone. Only if
   * that lookup fails do we fall back to the (signed) body itself.
   */
  @Post('snippe')
  @HttpCode(200)
  async handleSnippe(
    @Req() req: RawBodyRequest<Request>,
    @Body() body: SnippeWebhook,
    @Headers('x-webhook-signature') signature?: string,
    @Headers('x-webhook-timestamp') timestamp?: string,
    @Headers('x-webhook-event') eventHeader?: string,
  ) {
    const signed = this.snippe.verifyWebhook(req.rawBody, timestamp, signature);
    if (this.snippe.hasWebhookSecret) {
      if (!signed) throw new UnauthorizedException('Bad webhook signature');
    } else if (process.env.NODE_ENV === 'production') {
      throw new UnauthorizedException('Webhook secret not configured');
    } else {
      this.logger.warn(
        'SNIPPE_WEBHOOK_SECRET not set — relying on API lookup only (dev)',
      );
    }

    const type = String(body?.type ?? eventHeader ?? '');
    const data = body?.data ?? {};
    const reference = typeof data.reference === 'string' ? data.reference : '';
    if (!reference) return { received: true, result: 'ignored' };

    if (type.startsWith('payment.')) {
      const payment = await this.resolvePayment(type, reference, data, signed);
      if (!payment) return { received: true, result: 'unverified' };
      const result = await this.payments.syncSnippePayment(
        payment,
        body as unknown as Prisma.InputJsonValue,
      );
      this.logger.log(`Snippe ${type} ${reference} -> ${result}`);
      return { received: true, result };
    }

    if (type.startsWith('payout.')) {
      const payout = await this.resolvePayout(type, reference, data, signed);
      if (!payout) return { received: true, result: 'unverified' };
      const result = await this.payouts.syncByReference(
        payout,
        body as unknown as Prisma.InputJsonValue,
      );
      this.logger.log(`Snippe ${type} ${reference} -> ${result}`);
      return { received: true, result };
    }

    return { received: true, result: 'ignored' };
  }

  private async resolvePayment(
    type: string,
    reference: string,
    data: Record<string, any>,
    signed: boolean,
  ): Promise<SnippePayment | null> {
    try {
      if (this.snippe.configured) return await this.snippe.getPayment(reference);
    } catch (e) {
      this.logger.warn(
        `Could not verify payment ${reference} with Snippe: ${(e as Error).message}`,
      );
    }
    if (!signed) return null; // never act on an unsigned, unverifiable body
    const statusByEvent: Record<string, SnippePayment['status']> = {
      'payment.completed': 'completed',
      'payment.failed': 'failed',
      'payment.voided': 'voided',
      'payment.expired': 'expired',
    };
    const status = statusByEvent[type];
    if (!status) return null;
    return { ...(data as object), reference, status } as SnippePayment;
  }

  private async resolvePayout(
    type: string,
    reference: string,
    data: Record<string, any>,
    signed: boolean,
  ): Promise<SnippePayout | null> {
    try {
      if (this.snippe.configured) return await this.snippe.getPayout(reference);
    } catch (e) {
      this.logger.warn(
        `Could not verify payout ${reference} with Snippe: ${(e as Error).message}`,
      );
    }
    if (!signed) return null;
    const statusByEvent: Record<string, SnippePayout['status']> = {
      'payout.completed': 'completed',
      'payout.failed': 'failed',
      'payout.reversed': 'reversed',
    };
    const status = statusByEvent[type];
    if (!status) return null;
    return { ...(data as object), reference, status } as SnippePayout;
  }
}
