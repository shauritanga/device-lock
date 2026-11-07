import { createHmac, timingSafeEqual } from 'crypto';
import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Money as Snippe returns it. */
export interface SnippeMoney {
  currency: string;
  value: number;
}

export interface SnippePayment {
  reference: string;
  status: 'pending' | 'completed' | 'failed' | 'voided' | 'expired';
  amount?: SnippeMoney;
  channel?: { type?: string; provider?: string };
  settlement?: { gross?: SnippeMoney; fees?: SnippeMoney; net?: SnippeMoney };
  metadata?: Record<string, unknown>;
  failure_reason?: string;
}

export interface SnippePayout {
  reference: string;
  status: 'pending' | 'completed' | 'failed' | 'reversed';
  amount?: SnippeMoney;
  fees?: SnippeMoney;
  failure_reason?: string;
}

/** Thrown when Snippe answered with a 4xx: the request itself was rejected. */
export class SnippeRejectedError extends Error {
  constructor(
    readonly httpStatus: number,
    readonly errorCode: string | undefined,
    message: string,
  ) {
    super(message);
  }
}

/** Snippe rejects idempotency keys over 30 chars on payments (as a 500). */
const MAX_PAYMENT_KEY = 30;
export const SNIPPE_MIN_COLLECTION = 500;
export const SNIPPE_MIN_PAYOUT = 5000;

/** Max age of a webhook timestamp we accept (replay protection). */
const WEBHOOK_TOLERANCE_SEC = 300;

/**
 * Snippe API client — collections (USSD push) and disbursements (payouts).
 * Docs: https://docs.snippe.sh/docs/2026-01-25
 */
@Injectable()
export class SnippeService {
  private readonly logger = new Logger(SnippeService.name);
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly webhookSecret?: string;

  constructor(config: ConfigService) {
    this.baseUrl = config.get<string>('SNIPPE_BASE_URL')!.replace(/\/+$/, '');
    this.apiKey = config.get<string>('SNIPPE_API_KEY');
    this.webhookSecret = config.get<string>('SNIPPE_WEBHOOK_SECRET');
  }

  get configured(): boolean {
    return !!this.apiKey;
  }

  get hasWebhookSecret(): boolean {
    return !!this.webhookSecret;
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    opts: { body?: unknown; idempotencyKey?: string } = {},
  ): Promise<T> {
    if (!this.apiKey) {
      throw new ServiceUnavailableException('Snippe is not configured');
    }
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
    };
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: AbortSignal.timeout(20_000),
      });
    } catch (e) {
      // Network error / timeout: outcome unknown. Callers decide how to recover.
      throw new BadGatewayException(
        `Snippe unreachable: ${(e as Error).message}`,
      );
    }

    const text = await res.text();
    let json: any;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = {};
    }
    if (!res.ok) {
      const message = json?.message ?? text.slice(0, 200) ?? res.statusText;
      // Snippe reports "insufficient balance" as a 500 payment_failed; nothing
      // was sent, so treat it as a definitive rejection rather than an outage.
      if (/insufficient balance/i.test(String(message))) {
        throw new SnippeRejectedError(res.status, json?.error_code, message);
      }
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        throw new SnippeRejectedError(res.status, json?.error_code, message);
      }
      throw new BadGatewayException(`Snippe ${res.status}: ${message}`);
    }
    return json.data as T;
  }

  /** Collapse Snippe's payment status into what we act on. */
  static paymentOutcome(
    status: string,
  ): 'received' | 'failed' | 'pending' {
    if (status === 'completed') return 'received';
    if (['failed', 'voided', 'expired'].includes(status)) return 'failed';
    return 'pending';
  }

  /** Normalise a Tanzanian number to 255XXXXXXXXX. */
  static normalizePhone(raw: string): string {
    const d = raw.replace(/[^\d]/g, '');
    if (d.startsWith('255') && d.length === 12) return d;
    if (d.startsWith('0') && d.length === 10) return `255${d.slice(1)}`;
    if (d.length === 9) return `255${d}`;
    return d;
  }

  /** POST /v1/payments — customer gets a USSD push and enters their PIN. */
  createPayment(input: {
    amount: number;
    phone: string;
    customer: { firstname: string; lastname: string; email: string };
    idempotencyKey: string;
    webhookUrl?: string;
    metadata?: Record<string, string>;
  }): Promise<SnippePayment> {
    if (input.idempotencyKey.length > MAX_PAYMENT_KEY) {
      throw new Error(`Idempotency key exceeds ${MAX_PAYMENT_KEY} chars`);
    }
    return this.request<SnippePayment>('POST', '/v1/payments', {
      idempotencyKey: input.idempotencyKey,
      body: {
        payment_type: 'mobile',
        details: { amount: Math.round(input.amount), currency: 'TZS' },
        phone_number: SnippeService.normalizePhone(input.phone),
        customer: input.customer,
        ...(input.webhookUrl ? { webhook_url: input.webhookUrl } : {}),
        ...(input.metadata ? { metadata: input.metadata } : {}),
      },
    });
  }

  getPayment(reference: string): Promise<SnippePayment> {
    return this.request<SnippePayment>(
      'GET',
      `/v1/payments/${encodeURIComponent(reference)}`,
    );
  }

  /** GET /v1/payouts/fee — what Snippe charges to send `amount`. */
  async getPayoutFee(amount: number): Promise<number> {
    const d = await this.request<{ fee_amount: number }>(
      'GET',
      `/v1/payouts/fee?amount=${Math.round(amount)}`,
    );
    return Number(d.fee_amount);
  }

  /** POST /v1/payouts/send — mobile-money disbursement. */
  createPayout(input: {
    amount: number;
    phone: string;
    name: string;
    narration: string;
    idempotencyKey: string;
    webhookUrl?: string;
    metadata?: Record<string, string>;
  }): Promise<SnippePayout> {
    return this.request<SnippePayout>('POST', '/v1/payouts/send', {
      idempotencyKey: input.idempotencyKey,
      body: {
        amount: Math.round(input.amount),
        channel: 'mobile',
        recipient_phone: SnippeService.normalizePhone(input.phone),
        recipient_name: input.name,
        narration: input.narration,
        ...(input.webhookUrl ? { webhook_url: input.webhookUrl } : {}),
        ...(input.metadata ? { metadata: input.metadata } : {}),
      },
    });
  }

  getPayout(reference: string): Promise<SnippePayout> {
    return this.request<SnippePayout>(
      'GET',
      `/v1/payouts/${encodeURIComponent(reference)}`,
    );
  }

  /**
   * Verify `X-Webhook-Signature` = hex(HMAC-SHA256(secret, `${timestamp}.${rawBody}`)),
   * constant-time, rejecting stale timestamps. Fails closed without a secret.
   */
  verifyWebhook(
    rawBody: Buffer | string | undefined,
    timestamp: string | undefined,
    signature: string | undefined,
    now = Date.now(),
  ): boolean {
    if (!this.webhookSecret || !rawBody || !timestamp || !signature) {
      return false;
    }
    const ts = Number(timestamp);
    if (!Number.isFinite(ts)) return false;
    if (Math.abs(now / 1000 - ts) > WEBHOOK_TOLERANCE_SEC) return false;

    const expected = createHmac('sha256', this.webhookSecret)
      .update(`${timestamp}.`)
      .update(rawBody)
      .digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(signature.trim().toLowerCase());
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
