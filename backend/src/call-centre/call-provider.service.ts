import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface BridgeCallRequest {
  attemptId: string;
  staffPhone?: string;
  customerPhone: string;
  customerName: string;
}

export interface BridgeCallResult {
  provider: string;
  providerCallId?: string;
  status: string;
  verificationStatus: string;
  rawPayload?: Record<string, unknown>;
}

@Injectable()
export class CallProviderService {
  private readonly logger = new Logger(CallProviderService.name);
  private readonly url?: string;
  private readonly apiKey?: string;
  private readonly provider: string;

  constructor(config: ConfigService) {
    this.url = config.get<string>('CALL_PROVIDER_URL');
    this.apiKey = config.get<string>('CALL_PROVIDER_API_KEY');
    this.provider = config.get<string>('CALL_PROVIDER_NAME', 'GENERIC');
  }

  async startBridgeCall(input: BridgeCallRequest): Promise<BridgeCallResult> {
    if (!this.url || !this.apiKey || !input.staffPhone) {
      this.logger.debug(
        `[call stub] attempt=${input.attemptId} staff=${input.staffPhone ?? 'missing'} customer=${input.customerPhone}`,
      );
      return {
        provider: this.provider,
        status: input.staffPhone ? 'STUBBED' : 'STAFF_PHONE_REQUIRED',
        verificationStatus: 'SELF_REPORTED',
      };
    }

    const payload = {
      attemptId: input.attemptId,
      staffPhone: input.staffPhone,
      customerPhone: input.customerPhone,
      customerName: input.customerName,
    };
    const res = await fetch(this.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    let body: Record<string, unknown> = {};
    try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
    if (!res.ok) {
      this.logger.warn(`Call provider failed ${res.status}: ${text}`);
      return { provider: this.provider, status: 'FAILED', verificationStatus: 'FAILED', rawPayload: body };
    }
    return {
      provider: this.provider,
      providerCallId: stringValue(body.id ?? body.callId ?? body.reference),
      status: stringValue(body.status) ?? 'REQUESTED',
      verificationStatus: 'ATTEMPTED',
      rawPayload: body,
    };
  }
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
