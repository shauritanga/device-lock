import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { checksumMatches, createPayloadChecksum } from './checksum';

export interface UssdPushResult {
  id: string;
  status: string; // PROCESSING | SUCCESS | FAILED | SETTLED
  channel?: string;
  orderReference: string;
  collectedAmount?: string;
  collectedCurrency?: string;
}

/**
 * ClickPesa third-parties API client.
 * Docs: https://docs.clickpesa.com/home/integration-overview
 */
@Injectable()
export class ClickPesaService {
  private readonly logger = new Logger(ClickPesaService.name);
  private readonly baseUrl: string;
  private readonly clientId?: string;
  private readonly apiKey?: string;
  private readonly checksumKey?: string;

  private cachedToken?: { header: string; expiresAt: number };

  constructor(config: ConfigService) {
    this.baseUrl = config.get<string>('CLICKPESA_BASE_URL')!;
    this.clientId = config.get<string>('CLICKPESA_CLIENT_ID');
    this.apiKey = config.get<string>('CLICKPESA_API_KEY');
    this.checksumKey = config.get<string>('CLICKPESA_CHECKSUM_KEY');
  }

  get configured(): boolean {
    return !!(this.clientId && this.apiKey);
  }

  /** POST /generate-token (headers client-id, api-key). JWT valid 1 hour. */
  private async getAuthHeader(): Promise<string> {
    if (!this.configured) {
      throw new ServiceUnavailableException('ClickPesa is not configured');
    }
    const now = Date.now();
    if (this.cachedToken && this.cachedToken.expiresAt > now) {
      return this.cachedToken.header;
    }

    const res = await fetch(`${this.baseUrl}/generate-token`, {
      method: 'POST',
      headers: {
        'client-id': this.clientId!,
        'api-key': this.apiKey!,
      },
    });
    if (!res.ok) {
      throw new ServiceUnavailableException(
        `ClickPesa token error ${res.status}`,
      );
    }
    const body = (await res.json()) as { success: boolean; token: string };
    const header = body.token.startsWith('Bearer ')
      ? body.token
      : `Bearer ${body.token}`;
    // Refresh a little early (token lives 1h).
    this.cachedToken = { header, expiresAt: now + 55 * 60 * 1000 };
    return header;
  }

  /** POST /payments/initiate-ussd-push-request */
  async initiateUssdPush(input: {
    amount: string;
    orderReference: string;
    phoneNumber: string;
  }): Promise<UssdPushResult> {
    const auth = await this.getAuthHeader();

    const payload: Record<string, string> = {
      amount: input.amount,
      currency: 'TZS',
      orderReference: input.orderReference,
      phoneNumber: input.phoneNumber,
    };
    if (this.checksumKey) {
      payload.checksum = createPayloadChecksum(this.checksumKey, payload);
    }

    const res = await fetch(
      `${this.baseUrl}/payments/initiate-ussd-push-request`,
      {
        method: 'POST',
        headers: { Authorization: auth, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
    );
    if (!res.ok) {
      const text = await res.text();
      throw new ServiceUnavailableException(
        `ClickPesa USSD push failed ${res.status}: ${text}`,
      );
    }
    return (await res.json()) as UssdPushResult;
  }

  /** GET /payments/{orderReference} -> array of payment objects. */
  async queryStatus(orderReference: string): Promise<any[]> {
    const auth = await this.getAuthHeader();
    const res = await fetch(`${this.baseUrl}/payments/${orderReference}`, {
      headers: { Authorization: auth },
    });
    if (!res.ok) {
      throw new ServiceUnavailableException(
        `ClickPesa status query failed ${res.status}`,
      );
    }
    return (await res.json()) as any[];
  }

  /** Statuses (docs/home/payment-status) that mean the money was received. */
  static readonly RECEIVED_STATUSES = ['SUCCESS', 'SETTLED'];
  /** Statuses where funds that were received are later returned to the payer. */
  static readonly REVERSED_STATUSES = ['REVERSED', 'REFUNDED'];

  /** Classify a raw ClickPesa status string into an outcome bucket. */
  static classifyStatus(
    status: string,
  ): 'received' | 'reversed' | 'failed' | 'pending' {
    const s = status.toUpperCase();
    if (ClickPesaService.REVERSED_STATUSES.includes(s)) return 'reversed';
    if (ClickPesaService.RECEIVED_STATUSES.includes(s)) return 'received';
    if (s === 'FAILED') return 'failed';
    return 'pending'; // PROCESSING, PENDING, ON-HOLD, or unknown
  }

  /**
   * Authoritatively resolve a payment's outcome straight from ClickPesa's API
   * rather than trusting a webhook body — the primary defence against forged
   * webhooks. Returns the resolved bucket, 'pending' when not yet final, or
   * null when the API can't be reached (caller must not act on null).
   */
  async queryOutcome(
    orderReference: string,
  ): Promise<'received' | 'reversed' | 'failed' | 'pending' | null> {
    try {
      const payments = await this.queryStatus(orderReference);
      if (!Array.isArray(payments) || payments.length === 0) return 'pending';
      const buckets = payments.map((p) =>
        ClickPesaService.classifyStatus(String(p?.status ?? '')),
      );
      // A reversal is the most consequential final state; then received, then failed.
      if (buckets.includes('reversed')) return 'reversed';
      if (buckets.includes('received')) return 'received';
      if (buckets.includes('failed')) return 'failed';
      return 'pending';
    } catch (e) {
      this.logger.warn(
        `Could not resolve payment ${orderReference}: ${(e as Error).message}`,
      );
      return null;
    }
  }

  /** True only if the webhook `data` carries a checksum we can verify. */
  hasChecksum(data: Record<string, unknown>): boolean {
    return typeof data.checksum === 'string' && data.checksum.length > 0;
  }

  /**
   * Verify a webhook payload's `data` object against its checksum (HMAC-SHA256,
   * per docs.clickpesa.com/home/checksum). Fails closed: no checksum, no key, or
   * a mismatch all return false. Callers that get false should fall back to
   * [confirmPaymentReceived] rather than trust the body.
   */
  verifyWebhookData(data: Record<string, unknown>): boolean {
    const provided = data.checksum as string | undefined;
    if (!provided) return false;
    if (!this.checksumKey) {
      this.logger.warn('Webhook has checksum but no key configured');
      return false;
    }
    const expected = createPayloadChecksum(this.checksumKey, data);
    return checksumMatches(expected, provided);
  }
}
