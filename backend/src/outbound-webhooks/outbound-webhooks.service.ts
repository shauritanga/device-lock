import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { createHmac } from 'crypto';
import type { Env } from '../config/env.validation';
import { PrismaService } from '../common/prisma/prisma.service';
import { assertPublicWebhookUrl } from './url-safety';

const MAX_ATTEMPTS = 6;
const TIMEOUT_MS = 10_000;
const BATCH = 20;

/** Seconds to wait before retry N (1-based): 30s, 2m, 8m, 32m, ~2h. */
const backoffSeconds = (attempt: number) => 30 * 4 ** (attempt - 1);

export type PartnerEvent =
  | 'device.locked'
  | 'device.unlocked'
  | 'command.failed'
  | 'webhook.test';

/** `t=<unix>,v1=<hex hmac of "t.body">` — receivers recompute and compare. */
export function signWebhook(secret: string, timestamp: number, body: string): string {
  const v1 = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  return `t=${timestamp},v1=${v1}`;
}

/**
 * Durable outbound webhooks to partner systems. Events are written to WebhookDelivery
 * (inside the caller's transaction when given one) and a poller delivers them with
 * exponential backoff, so a partner outage never blocks or loses a lock result.
 */
@Injectable()
export class OutboundWebhooksService {
  private readonly logger = new Logger(OutboundWebhooksService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Queue an event for a partner. Pass the transaction client to make it atomic. */
  async enqueue(
    apiClientId: string,
    eventType: PartnerEvent,
    data: Record<string, unknown>,
    tx: Pick<PrismaService, 'webhookDelivery'> = this.prisma,
  ) {
    const row = await tx.webhookDelivery.create({
      data: { apiClientId, eventType, payload: {} },
    });
    // The delivery id doubles as the event id, so receivers can de-duplicate retries.
    await tx.webhookDelivery.update({
      where: { id: row.id },
      data: {
        payload: {
          id: row.id,
          type: eventType,
          createdAt: row.createdAt.toISOString(),
          data,
        } as Prisma.InputJsonValue,
      },
    });
  }

  @Interval(15_000)
  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const due = await this.prisma.webhookDelivery.findMany({
        where: { status: 'PENDING', nextAttemptAt: { lte: new Date() } },
        orderBy: { nextAttemptAt: 'asc' },
        take: BATCH,
        include: { apiClient: true },
      });
      for (const d of due) await this.deliver(d);
    } catch (e) {
      this.logger.error(`Webhook poll failed: ${(e as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  private async deliver(d: Prisma.WebhookDeliveryGetPayload<{ include: { apiClient: true } }>) {
    const attempts = d.attempts + 1;
    const client = d.apiClient;
    let status: number | null = null;
    let error: string | null = null;

    if (!client.webhookUrl || client.status !== 'ACTIVE') {
      error = client.webhookUrl ? 'Client is not active' : 'No webhook URL configured';
    } else {
      try {
        const url = await assertPublicWebhookUrl(
          client.webhookUrl,
          this.config.get('WEBHOOK_ALLOW_PRIVATE', { infer: true }) === 'true',
        );
        const body = JSON.stringify(d.payload);
        const res = await fetch(url, {
          method: 'POST',
          redirect: 'manual', // a 3xx could bounce us to an internal address
          signal: AbortSignal.timeout(TIMEOUT_MS),
          headers: {
            'content-type': 'application/json',
            'user-agent': 'DeviceLock-Webhooks/1',
            'x-devicelock-event': d.eventType,
            'x-devicelock-signature': signWebhook(
              client.webhookSecret,
              Math.floor(Date.now() / 1000),
              body,
            ),
          },
          body,
        });
        status = res.status;
        if (res.status < 200 || res.status >= 300) error = `HTTP ${res.status}`;
      } catch (e) {
        error = (e as Error).message.slice(0, 300);
      }
    }

    if (!error) {
      await this.prisma.webhookDelivery.update({
        where: { id: d.id },
        data: {
          status: 'DELIVERED',
          attempts,
          lastStatus: status,
          lastError: null,
          deliveredAt: new Date(),
        },
      });
      return;
    }

    const giveUp = attempts >= MAX_ATTEMPTS;
    if (giveUp) {
      this.logger.warn(`Webhook ${d.id} to ${client.name} failed permanently: ${error}`);
    }
    await this.prisma.webhookDelivery.update({
      where: { id: d.id },
      data: {
        attempts,
        lastStatus: status,
        lastError: error,
        status: giveUp ? 'FAILED' : 'PENDING',
        nextAttemptAt: new Date(Date.now() + backoffSeconds(attempts) * 1000),
      },
    });
  }
}
