import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import { App, cert, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

export interface PushTarget {
  deviceId: string;
  fcmToken: string | null;
}

/**
 * Sends a silent "you have a pending command, check in now" data message to a
 * device. This is the *instant* delivery path; the agent's periodic check-in is
 * the reliable fallback, so commands still work even when push is unavailable.
 *
 * Activated by setting FCM_SERVICE_ACCOUNT_JSON to either the service-account
 * JSON itself or a path to the JSON file. Unset -> this stays a no-op and the
 * device relies on its periodic check-in.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private app: App | null = null;

  constructor(config: ConfigService) {
    const raw = config.get<string>('FCM_SERVICE_ACCOUNT_JSON');
    if (!raw) return;

    try {
      const json = raw.trim().startsWith('{')
        ? raw
        : fs.readFileSync(raw, 'utf8');
      this.app = initializeApp(
        { credential: cert(JSON.parse(json)) },
        'device-lock-push',
      );
      this.logger.log('FCM push delivery enabled');
    } catch (e) {
      this.logger.error(
        `FCM init failed, falling back to check-in: ${(e as Error).message}`,
      );
    }
  }

  async notifyCommandPending(target: PushTarget): Promise<boolean> {
    if (!target.fcmToken) {
      // No token yet; the device will still pull the command at next check-in.
      return false;
    }
    if (!this.app) {
      this.logger.debug(
        `[push stub] would wake device ${target.deviceId} via FCM`,
      );
      return false;
    }

    try {
      const id = await getMessaging(this.app).send({
        token: target.fcmToken,
        // Silent data message: the agent wakes and runs a check-in.
        data: { type: 'SYNC', deviceId: target.deviceId },
        android: { priority: 'high' },
      });
      this.logger.log(`FCM push sent to ${target.deviceId} (msg ${id})`);
      return true;
    } catch (e) {
      // A dead token or transient error just means we wait for the next check-in.
      this.logger.warn(
        `FCM send failed for ${target.deviceId}: ${(e as Error).message}`,
      );
      return false;
    }
  }
}
