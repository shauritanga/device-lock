import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../common/prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  async check() {
    let db = 'down';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      db = 'up';
    } catch {
      db = 'down';
    }
    return { status: 'ok', db, ts: new Date().toISOString() };
  }

  @Get('readiness')
  async readiness() {
    const db = await this.dbReady();
    const checks = [
      { name: 'database', ok: db },
      { name: 'jwt_access_secret', ok: this.present('JWT_ACCESS_SECRET') },
      { name: 'jwt_refresh_secret', ok: this.present('JWT_REFRESH_SECRET') },
      { name: 'public_base_url', ok: this.present('PUBLIC_BASE_URL'), optional: true },
      { name: 'clickpesa_credentials', ok: this.allPresent('CLICKPESA_CLIENT_ID', 'CLICKPESA_API_KEY', 'CLICKPESA_CHECKSUM_KEY'), optional: true },
      { name: 'beem_credentials', ok: this.allPresent('BEEM_API_KEY', 'BEEM_SECRET_KEY'), optional: true },
      { name: 'voice_provider', ok: this.allPresent('VOICE_CALL_URL', 'VOICE_API_KEY'), optional: true },
      { name: 'call_provider', ok: this.allPresent('CALL_PROVIDER_URL', 'CALL_PROVIDER_API_KEY'), optional: true },
      { name: 'fcm_service_account', ok: this.present('FCM_SERVICE_ACCOUNT_JSON'), optional: true },
      { name: 'provisioning_signature', ok: this.present('PROVISIONING_SIGNATURE_CHECKSUM') },
    ];
    const requiredReady = checks.every((check) => check.optional || check.ok);
    return {
      status: requiredReady ? 'ready' : 'not_ready',
      checks,
      ts: new Date().toISOString(),
    };
  }

  private async dbReady() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  private present(name: string) {
    return !!this.config.get<string>(name);
  }

  private allPresent(...names: string[]) {
    return names.every((name) => this.present(name));
  }
}
