import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Beem Africa SMS client.
 * POST https://apisms.beem.africa/v1/send with HTTP Basic auth
 * base64(api_key:secret_key). When unconfigured it logs instead of sending,
 * so reminder flows work in development without credentials.
 */
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly sendUrl: string;
  private readonly senderId: string;
  private readonly authHeader?: string;

  constructor(config: ConfigService) {
    this.sendUrl = config.get<string>('BEEM_SEND_URL')!;
    this.senderId = config.get<string>('BEEM_SENDER_ID', 'INFO');
    const apiKey = config.get<string>('BEEM_API_KEY');
    const secret = config.get<string>('BEEM_SECRET_KEY');
    if (apiKey && secret) {
      this.authHeader =
        'Basic ' + Buffer.from(`${apiKey}:${secret}`).toString('base64');
    }
  }

  /** Send an SMS to a single MSISDN (format 2557XXXXXXXX). Returns success. */
  async send(dest: string, message: string): Promise<boolean> {
    if (!this.authHeader) {
      this.logger.debug(`[sms stub] to ${dest}: ${message}`);
      return false;
    }
    try {
      const res = await fetch(this.sendUrl, {
        method: 'POST',
        headers: {
          Authorization: this.authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          source_addr: this.senderId,
          encoding: 0,
          message,
          recipients: [{ recipient_id: 1, dest_addr: normalizeMsisdn(dest) }],
        }),
      });
      if (!res.ok) {
        this.logger.warn(`Beem send failed ${res.status}`);
        return false;
      }
      return true;
    } catch (e) {
      this.logger.warn(`Beem send error: ${(e as Error).message}`);
      return false;
    }
  }
}

/** Best-effort normalization to Beem's expected 2557XXXXXXXX form. */
export function normalizeMsisdn(input: string): string {
  let n = input.replace(/[^\d]/g, '');
  if (n.startsWith('0')) n = '255' + n.slice(1);
  if (n.length === 9) n = '255' + n; // bare 7XXXXXXXX
  return n;
}
