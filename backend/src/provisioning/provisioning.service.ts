import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import type { Env } from '../config/env.validation';

/**
 * Builds the Android setup-wizard provisioning payload used for zero-touch /
 * QR enrollment. A factory-fresh device scanned with this QR downloads the
 * agent APK, verifies its signing certificate, installs it as **Device Owner**,
 * and hands it the admin-extras bundle — which carries the enrollment token so
 * the agent auto-enrols with no typing.
 *
 * Only the enrollment token is placed in the QR; the backend URL is baked into
 * the APK at build time so the agent can't be repointed at a rogue server.
 *
 * Do not put PACKAGE_CHECKSUM (hash of the APK file) in the QR. That hash
 * changes every rebuild, so a console tab left open still shows a QR that
 * downloads the new APK and then fails with a generic IT-admin error.
 * SIGNATURE_CHECKSUM is the signing cert and stays stable across releases.
 */
@Injectable()
export class ProvisioningService {
  private readonly component: string;
  private readonly checksum: string;
  private readonly apkUrl?: string;
  private readonly publicBaseUrl?: string;
  /** Local APK file streamed at GET /v1/provisioning/agent.apk. */
  readonly apkPath: string;

  constructor(config: ConfigService<Env, true>) {
    this.component = config.get('PROVISIONING_ADMIN_COMPONENT', { infer: true });
    this.checksum =
      config.get('PROVISIONING_SIGNATURE_CHECKSUM', { infer: true }) ?? '';
    this.apkUrl = config.get('PROVISIONING_APK_URL', { infer: true });
    this.publicBaseUrl = config.get('PUBLIC_BASE_URL', { infer: true });
    this.apkPath =
      config.get('PROVISIONING_APK_PATH', { infer: true }) ??
      path.resolve(
        process.cwd(),
        '..',
        'android-dpc/app/build/outputs/apk/release/app-release.apk',
      );
  }

  /** URL the setup wizard downloads the agent APK from. */
  private downloadLocation(): string {
    if (this.apkUrl) return this.apkUrl;
    const base = (this.publicBaseUrl ?? 'http://localhost:3001').replace(
      /\/$/,
      '',
    );
    return `${base}/v1/provisioning/agent.apk`;
  }

  /**
   * The JSON a shop encodes into the provisioning QR. Keys are the exact
   * `android.app.extra.PROVISIONING_*` names the setup wizard expects.
   */
  buildProvisioningPayload(enrollmentToken: string): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      'android.app.extra.PROVISIONING_DEVICE_ADMIN_COMPONENT_NAME':
        this.component.includes('/')
          ? this.component
          : `${this.component}/.LockAdminReceiver`,
      'android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_DOWNLOAD_LOCATION':
        this.downloadLocation(),
      'android.app.extra.PROVISIONING_LEAVE_ALL_SYSTEM_APPS_ENABLED': true,
      'android.app.extra.PROVISIONING_ADMIN_EXTRAS_BUNDLE': {
        enrollmentToken,
      },
    };

    if (this.checksum) {
      // AOSP samples keep base64 padding (`=`). URL-safe alphabet is required.
      payload[
        'android.app.extra.PROVISIONING_DEVICE_ADMIN_SIGNATURE_CHECKSUM'
      ] = padBase64Url(this.checksum);
    }

    return payload;
  }
}

function padBase64Url(value: string): string {
  const urlSafe = value.replace(/\+/g, '-').replace(/\//g, '_');
  const pad = (4 - (urlSafe.length % 4)) % 4;
  return urlSafe + '='.repeat(pad);
}
