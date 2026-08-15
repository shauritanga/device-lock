import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import type { Env } from '../config/env.validation';

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

/**
 * Transactional email via Resend. When RESEND_API_KEY is unset, logs and
 * returns false so local flows still work without credentials.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend: Resend | null;
  private readonly from: string;

  constructor(config: ConfigService<Env, true>) {
    const apiKey = config.get('RESEND_API_KEY', { infer: true });
    this.from =
      config.get('EMAIL_FROM', { infer: true }) ??
      'Linda <noreply@linda.co.tz>';
    this.resend = apiKey ? new Resend(apiKey) : null;
    if (!this.resend) {
      this.logger.warn('RESEND_API_KEY unset — emails will be stubbed');
    }
  }

  async send(input: SendEmailInput): Promise<boolean> {
    if (!this.resend) {
      this.logger.debug(
        `[email stub] to=${input.to} subject=${input.subject}\n${input.text}`,
      );
      return false;
    }
    try {
      const { error } = await this.resend.emails.send({
        from: this.from,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
      });
      if (error) {
        this.logger.warn(`Resend failed for ${input.to}: ${error.message}`);
        return false;
      }
      return true;
    } catch (e) {
      this.logger.warn(
        `Resend error for ${input.to}: ${e instanceof Error ? e.message : e}`,
      );
      return false;
    }
  }

  /** Immediate reply after a website demo request. */
  async sendDemoRequestReceived(opts: {
    to: string;
    fullName: string;
    companyName: string;
  }): Promise<boolean> {
    const first = opts.fullName.trim().split(/\s+/)[0] || opts.fullName;
    const subject = 'We received your Linda demo request';
    const text = [
      `Hi ${first},`,
      '',
      `Thanks for requesting a demo of Linda for ${opts.companyName}.`,
      '',
      'We have received your request and will reply soon — usually within one business day.',
      '',
      'If you need us sooner, call or WhatsApp the number on linda.co.tz.',
      '',
      '— The Linda team',
    ].join('\n');
    const html = `
      <div style="font-family:system-ui,-apple-system,sans-serif;line-height:1.5;color:#1a1a1a;max-width:560px">
        <p>Hi ${escapeHtml(first)},</p>
        <p>Thanks for requesting a demo of <strong>Linda</strong> for
        <strong>${escapeHtml(opts.companyName)}</strong>.</p>
        <p>We have received your request and will reply soon — usually within one business day.</p>
        <p style="color:#555">If you need us sooner, call or WhatsApp the number on
        <a href="https://linda.co.tz">linda.co.tz</a>.</p>
        <p>— The Linda team</p>
      </div>
    `.trim();
    return this.send({ to: opts.to, subject, html, text });
  }

  /** Welcome + login credentials after a demo lead is converted to a company. */
  async sendClientWelcome(opts: {
    to: string;
    fullName: string;
    companyName: string;
    email: string;
    temporaryPassword: string;
    portalUrl: string;
  }): Promise<boolean> {
    const first = opts.fullName.trim().split(/\s+/)[0] || opts.fullName;
    const subject = `Welcome to Linda — your ${opts.companyName} account`;
    const text = [
      `Hi ${first},`,
      '',
      `Welcome to Linda. Your seller company “${opts.companyName}” is ready.`,
      '',
      'Sign in to the client portal with these details:',
      `  Portal:   ${opts.portalUrl}`,
      `  Email:    ${opts.email}`,
      `  Password: ${opts.temporaryPassword}`,
      '',
      'Please sign in and change your password after your first login.',
      '',
      'From the portal you can enroll devices, create loans, track repayments,',
      'and hand overdue customers to our collections team once your subscription is active.',
      '',
      '— The Linda team',
    ].join('\n');
    const html = `
      <div style="font-family:system-ui,-apple-system,sans-serif;line-height:1.5;color:#1a1a1a;max-width:560px">
        <p>Hi ${escapeHtml(first)},</p>
        <p>Welcome to <strong>Linda</strong>. Your seller company
        <strong>${escapeHtml(opts.companyName)}</strong> is ready.</p>
        <p>Sign in to the client portal with these details:</p>
        <table style="border-collapse:collapse;margin:16px 0;width:100%;max-width:420px">
          <tr>
            <td style="padding:8px 12px;background:#f4f4f5;border:1px solid #e4e4e7;font-weight:600">Portal</td>
            <td style="padding:8px 12px;border:1px solid #e4e4e7">
              <a href="${escapeHtml(opts.portalUrl)}">${escapeHtml(opts.portalUrl)}</a>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 12px;background:#f4f4f5;border:1px solid #e4e4e7;font-weight:600">Email</td>
            <td style="padding:8px 12px;border:1px solid #e4e4e7">${escapeHtml(opts.email)}</td>
          </tr>
          <tr>
            <td style="padding:8px 12px;background:#f4f4f5;border:1px solid #e4e4e7;font-weight:600">Password</td>
            <td style="padding:8px 12px;border:1px solid #e4e4e7;font-family:ui-monospace,monospace">${escapeHtml(opts.temporaryPassword)}</td>
          </tr>
        </table>
        <p>Please sign in and change your password after your first login.</p>
        <p style="color:#555">From the portal you can enroll devices, create loans, track repayments,
        and hand overdue customers to our collections team once your subscription is active.</p>
        <p>— The Linda team</p>
      </div>
    `.trim();
    return this.send({ to: opts.to, subject, html, text });
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
