import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { normalizeMsisdn } from './sms.service';

export interface VoiceCallResult {
  sent: boolean;
  providerRef?: string;
}

/** Generic voice/IVR reminder client. Unconfigured providers are stubbed in dev. */
@Injectable()
export class VoiceService {
  private readonly logger = new Logger(VoiceService.name);
  private readonly callUrl?: string;
  private readonly apiKey?: string;
  private readonly senderId: string;

  constructor(config: ConfigService) {
    this.callUrl = config.get<string>('VOICE_CALL_URL');
    this.apiKey = config.get<string>('VOICE_API_KEY');
    this.senderId = config.get<string>('VOICE_SENDER_ID', 'SimuLinda');
  }

  async callReminder(dest: string, message: string): Promise<VoiceCallResult> {
    if (!this.callUrl || !this.apiKey) {
      this.logger.debug(`[voice stub] to ${dest}: ${message}`);
      return { sent: false };
    }

    try {
      const res = await fetch(this.callUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: this.senderId,
          to: normalizeMsisdn(dest),
          message,
        }),
      });
      const text = await res.text();
      if (!res.ok) {
        this.logger.warn(`Voice call failed ${res.status}: ${text}`);
        return { sent: false };
      }
      const providerRef = parseProviderRef(text);
      return { sent: true, providerRef };
    } catch (e) {
      this.logger.warn(`Voice call error: ${(e as Error).message}`);
      return { sent: false };
    }
  }
}

function parseProviderRef(text: string) {
  if (!text.trim()) return undefined;
  try {
    const json = JSON.parse(text) as Record<string, unknown>;
    return String(json.id ?? json.callId ?? json.reference ?? '').trim() || undefined;
  } catch {
    return undefined;
  }
}
