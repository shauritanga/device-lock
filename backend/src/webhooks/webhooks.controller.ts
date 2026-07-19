import {
  Body,
  Controller,
  HttpCode,
  Logger,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Public } from '../common/decorators/public.decorator';
import { PaymentsService } from '../payments/payments.service';
import { ClickPesaService } from '../integrations/clickpesa/clickpesa.service';
import { PrismaService } from '../common/prisma/prisma.service';

interface ClickPesaWebhook {
  event?: string;
  data?: Record<string, any>;
}

/** Per docs: a successful collection webhook is event "PAYMENT RECEIVED". */
const SUCCESS_EVENT = 'PAYMENT RECEIVED';

/** What to do with the webhook once its outcome is trusted. */
type Applied = 'received' | 'failed' | 'reversed';
type Outcome = Applied | 'reject' | 'ignore';

@Public()
@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    private readonly payments: PaymentsService,
    private readonly clickpesa: ClickPesaService,
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
   * ClickPesa payment callback (docs.clickpesa.com/home/webhooks).
   *
   * A webhook body is untrusted, so we never unlock on it alone. When ClickPesa
   * is configured, we confirm the outcome straight from its API; otherwise we
   * require a valid checksum. Only then is the payment applied idempotently
   * (which may auto-unlock the device).
   */
  @Post('clickpesa')
  @HttpCode(200)
  async handleClickPesa(@Body() body: ClickPesaWebhook) {
    const data = body?.data;
    if (!data?.orderReference) {
      // Nothing actionable; ack so ClickPesa doesn't retry forever.
      return { received: true, result: 'ignored' };
    }

    const outcome = await this.resolveOutcome(body);
    if (outcome === 'reject') {
      throw new UnauthorizedException('Unverified ClickPesa webhook');
    }
    if (outcome === 'ignore') {
      return { received: true, result: 'ignored' };
    }

    const result = await this.payments.confirmFromWebhook(
      data.orderReference,
      data.id,
      outcome,
      data as Prisma.InputJsonValue,
    );
    this.logger.log(
      `ClickPesa webhook ${data.orderReference} -> ${result} ` +
        `(event=${body.event}, outcome=${outcome})`,
    );
    return { received: true, result };
  }

  /**
   * Decide the true payment outcome from a trusted source:
   *  1. ClickPesa configured -> its API is authoritative (immune to forged
   *     webhooks). A valid checksum is only a fallback if the API is unreachable.
   *  2. Not configured but a checksum is present -> verify the HMAC.
   *  3. Dev only (no API, no checksum) -> accept the body with a loud warning.
   * Non-final states resolve to 'ignore' (ack, do nothing).
   */
  private async resolveOutcome(body: ClickPesaWebhook): Promise<Outcome> {
    const data = body.data!;
    const orderReference = String(data.orderReference);

    if (this.clickpesa.configured) {
      const outcome = await this.clickpesa.queryOutcome(orderReference);
      if (outcome !== null) return outcome === 'pending' ? 'ignore' : outcome;
      // API unreachable: fall back to a cryptographically valid body only.
      if (this.clickpesa.verifyWebhookData(data)) return this.classifyBody(body);
      return 'reject';
    }

    if (this.clickpesa.hasChecksum(data)) {
      if (!this.clickpesa.verifyWebhookData(data)) return 'reject';
      return this.classifyBody(body);
    }

    this.logger.warn(
      `Accepting unverified ClickPesa webhook ${orderReference} ` +
        `(dev only: ClickPesa not configured and no checksum)`,
    );
    return this.classifyBody(body);
  }

  /** Classify a (verified) webhook body into an applied outcome. */
  private classifyBody(body: ClickPesaWebhook): Applied {
    const status = String(body.data?.status ?? '');
    if (
      body.event === SUCCESS_EVENT ||
      ClickPesaService.RECEIVED_STATUSES.includes(status)
    ) {
      return 'received';
    }
    if (ClickPesaService.REVERSED_STATUSES.includes(status.toUpperCase())) {
      return 'reversed';
    }
    return 'failed';
  }
}
