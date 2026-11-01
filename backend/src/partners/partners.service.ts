import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { CommandStatus, CommandType, DeviceStatus, Prisma } from '@prisma/client';
import { randomToken, sha256 } from '../common/crypto.util';
import { PrismaService } from '../common/prisma/prisma.service';
import type { Env } from '../config/env.validation';
import { CommandsService } from '../commands/commands.service';
import { OutboundWebhooksService } from '../outbound-webhooks/outbound-webhooks.service';
import { assertPublicWebhookUrl } from '../outbound-webhooks/url-safety';
import { AuthUser } from '../auth/auth.types';
import { PartnerIdentity } from './api-key.guard';
import {
  CreateApiKeyDto,
  CreatePartnerDto,
  PartnerLockDto,
  UpdateApiKeyDto,
  UpdatePartnerDto,
} from './dto/partner.dto';

const newKey = () => `dlk_live_${randomToken(24)}`;
const newSecret = () => `whsec_${randomToken(24)}`;

/** Never returned to callers: the key hash and the webhook signing secret. */
const PUBLIC_CLIENT_SELECT = {
  id: true,
  name: true,
  contactEmail: true,
  status: true,
  keyPrefix: true,
  webhookUrl: true,
  rateLimitPerMin: true,
  lastUsedAt: true,
  createdAt: true,
  ownerTenantId: true,
  readOnly: true,
} satisfies Prisma.ApiClientSelect;

const MAX_KEYS_PER_COMPANY = 10;
const LOG_RETENTION_DAYS = 30;

/** Device states a partner may not lock or unlock. */
const NOT_COMMANDABLE = new Set<DeviceStatus>([
  DeviceStatus.PENDING_ENROLLMENT,
  DeviceStatus.RELEASED,
  DeviceStatus.WIPED,
]);

@Injectable()
export class PartnersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commands: CommandsService,
    private readonly webhooks: OutboundWebhooksService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  // ---- platform admin ---------------------------------------------------

  async create(dto: CreatePartnerDto, actor: AuthUser) {
    if (dto.webhookUrl) await this.checkWebhookUrl(dto.webhookUrl);
    const tenantIds = [...new Set(dto.tenantIds ?? [])];
    if (tenantIds.length) await this.assertTenantsExist(tenantIds);

    const apiKey = newKey();
    const webhookSecret = newSecret();
    const client = await this.prisma.apiClient.create({
      data: {
        name: dto.name,
        contactEmail: dto.contactEmail,
        webhookUrl: dto.webhookUrl,
        webhookSecret,
        rateLimitPerMin: dto.rateLimitPerMin ?? 60,
        keyPrefix: apiKey.slice(0, 13),
        keyHash: sha256(apiKey),
        createdById: actor.userId,
        grants: { create: tenantIds.map((tenantId) => ({ tenantId })) },
      },
      select: PUBLIC_CLIENT_SELECT,
    });
    // The only time the key and secret are ever visible.
    return { ...client, apiKey, webhookSecret };
  }

  list() {
    return this.prisma.apiClient.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        ...PUBLIC_CLIENT_SELECT,
        grants: { select: { tenant: { select: { id: true, name: true } } } },
      },
    });
  }

  async findOne(id: string) {
    const client = await this.prisma.apiClient.findUnique({
      where: { id },
      select: {
        ...PUBLIC_CLIENT_SELECT,
        grants: {
          orderBy: { createdAt: 'asc' },
          select: { createdAt: true, tenant: { select: { id: true, name: true } } },
        },
        deliveries: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: {
            id: true,
            eventType: true,
            status: true,
            attempts: true,
            lastStatus: true,
            lastError: true,
            nextAttemptAt: true,
            deliveredAt: true,
            createdAt: true,
          },
        },
      },
    });
    if (!client) throw new NotFoundException('Partner not found');
    return client;
  }

  async update(id: string, dto: UpdatePartnerDto) {
    const current = await this.requireClient(id);
    if (current.status === 'REVOKED') {
      throw new ConflictException('A revoked partner cannot be modified');
    }
    if (dto.webhookUrl) await this.checkWebhookUrl(dto.webhookUrl);
    return this.prisma.apiClient.update({
      where: { id },
      data: {
        name: dto.name,
        contactEmail: dto.contactEmail,
        webhookUrl: dto.webhookUrl,
        rateLimitPerMin: dto.rateLimitPerMin,
        status: dto.status,
      },
      select: PUBLIC_CLIENT_SELECT,
    });
  }

  async revoke(id: string) {
    await this.requireClient(id);
    return this.prisma.apiClient.update({
      where: { id },
      data: { status: 'REVOKED' },
      select: PUBLIC_CLIENT_SELECT,
    });
  }

  async rotateKey(id: string) {
    const current = await this.requireClient(id);
    if (current.status === 'REVOKED') {
      throw new ConflictException('A revoked partner cannot be modified');
    }
    const apiKey = newKey();
    const client = await this.prisma.apiClient.update({
      where: { id },
      data: { keyPrefix: apiKey.slice(0, 13), keyHash: sha256(apiKey) },
      select: PUBLIC_CLIENT_SELECT,
    });
    return { ...client, apiKey };
  }

  async rotateWebhookSecret(id: string) {
    await this.requireClient(id);
    const webhookSecret = newSecret();
    await this.prisma.apiClient.update({ where: { id }, data: { webhookSecret } });
    return { webhookSecret };
  }

  async grant(id: string, tenantId: string) {
    await this.requireClient(id);
    await this.assertTenantsExist([tenantId]);
    await this.prisma.apiClientGrant.upsert({
      where: { apiClientId_tenantId: { apiClientId: id, tenantId } },
      update: {},
      create: { apiClientId: id, tenantId },
    });
    return this.findOne(id);
  }

  async ungrant(id: string, tenantId: string) {
    await this.requireClient(id);
    await this.prisma.apiClientGrant.deleteMany({
      where: { apiClientId: id, tenantId },
    });
    return this.findOne(id);
  }

  async sendTestWebhook(id: string) {
    const client = await this.requireClient(id);
    if (!client.webhookUrl) {
      throw new BadRequestException('Set a webhook URL first');
    }
    await this.webhooks.enqueue(id, 'webhook.test', { message: 'Test delivery' });
    return { queued: true };
  }

  // ---- company self-service (Developers page; every call is pinned to ownerTenantId) ----

  async createOwnedKey(tenantId: string, dto: CreateApiKeyDto, actor: AuthUser) {
    const active = await this.prisma.apiClient.count({
      where: { ownerTenantId: tenantId, status: { not: 'REVOKED' } },
    });
    if (active >= MAX_KEYS_PER_COMPANY) {
      throw new ConflictException(
        `You can have at most ${MAX_KEYS_PER_COMPANY} active API keys. Revoke one first.`,
      );
    }
    const user = await this.prisma.user.findUnique({
      where: { id: actor.userId },
      select: { email: true },
    });
    const apiKey = newKey();
    const webhookSecret = newSecret();
    const client = await this.prisma.apiClient.create({
      data: {
        name: dto.name,
        contactEmail: user?.email ?? 'unknown',
        webhookSecret,
        keyPrefix: apiKey.slice(0, 13),
        keyHash: sha256(apiKey),
        ownerTenantId: tenantId,
        readOnly: dto.readOnly ?? false,
        createdById: actor.userId,
        grants: { create: [{ tenantId }] },
      },
      select: PUBLIC_CLIENT_SELECT,
    });
    return { ...client, apiKey, webhookSecret };
  }

  listOwnedKeys(tenantId: string) {
    return this.prisma.apiClient.findMany({
      where: { ownerTenantId: tenantId },
      orderBy: { createdAt: 'desc' },
      select: PUBLIC_CLIENT_SELECT,
    });
  }

  async getOwnedKey(tenantId: string, id: string) {
    await this.requireOwned(tenantId, id);
    return this.findOne(id);
  }

  async updateOwnedKey(tenantId: string, id: string, dto: UpdateApiKeyDto) {
    const c = await this.requireOwned(tenantId, id);
    if (c.status === 'REVOKED') throw new ConflictException('This key is revoked');
    if (dto.webhookUrl) await this.checkWebhookUrl(dto.webhookUrl);
    return this.prisma.apiClient.update({
      where: { id },
      data: { name: dto.name, webhookUrl: dto.webhookUrl },
      select: PUBLIC_CLIENT_SELECT,
    });
  }

  async rollOwnedKey(tenantId: string, id: string) {
    await this.requireOwned(tenantId, id);
    return this.rotateKey(id);
  }

  async rollOwnedSecret(tenantId: string, id: string) {
    await this.requireOwned(tenantId, id);
    return this.rotateWebhookSecret(id);
  }

  async revokeOwnedKey(tenantId: string, id: string) {
    await this.requireOwned(tenantId, id);
    return this.revoke(id);
  }

  async testOwnedWebhook(tenantId: string, id: string) {
    await this.requireOwned(tenantId, id);
    return this.sendTestWebhook(id);
  }

  async ownedLogs(tenantId: string, keyId?: string, take = 100) {
    if (keyId) await this.requireOwned(tenantId, keyId);
    return this.prisma.apiRequestLog.findMany({
      where: { apiClient: { ownerTenantId: tenantId }, ...(keyId ? { apiClientId: keyId } : {}) },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(take, 1), 200),
      select: {
        id: true,
        method: true,
        path: true,
        status: true,
        durationMs: true,
        createdAt: true,
        apiClient: { select: { id: true, name: true, keyPrefix: true } },
      },
    });
  }

  /** Request logs are diagnostics, not records: keep a month. */
  @Interval(60 * 60 * 1000)
  async pruneLogs() {
    const cutoff = new Date(Date.now() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    await this.prisma.apiRequestLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
  }

  private async requireOwned(tenantId: string, id: string) {
    const c = await this.prisma.apiClient.findUnique({ where: { id } });
    // 404, not 403: don't reveal that another company's key exists.
    if (!c || c.ownerTenantId !== tenantId) throw new NotFoundException('API key not found');
    return c;
  }

  // ---- partner-facing (tenant already bound into CLS by ApiKeyGuard) ----

  async lookupByImei(imei: string) {
    const device = await this.prisma.scoped.device.findFirst({
      where: { imei },
      select: DEVICE_SELECT,
    });
    if (!device) throw new NotFoundException('Device not found');
    return this.deviceView(device);
  }

  async getDevice(deviceId: string) {
    const device = await this.prisma.scoped.device.findFirst({
      where: { id: deviceId },
      select: DEVICE_SELECT,
    });
    if (!device) throw new NotFoundException('Device not found');
    const last = await this.prisma.scoped.deviceCommand.findFirst({
      where: { deviceId },
      orderBy: { createdAt: 'desc' },
    });
    return { ...this.deviceView(device), lastCommand: last ? commandView(last) : null };
  }

  async getCommand(partner: PartnerIdentity, commandId: string) {
    // Partners only see commands issued through their own key.
    const cmd = await this.prisma.scoped.deviceCommand.findFirst({
      where: { id: commandId, apiClientId: partner.apiClientId },
    });
    if (!cmd) throw new NotFoundException('Command not found');
    return commandView(cmd);
  }

  /**
   * Queue a LOCK or UNLOCK. Returns `replay: true` when the idempotency key was already
   * used, in which case the original command is returned and nothing new is queued.
   */
  async changeLock(
    partner: PartnerIdentity,
    deviceId: string,
    type: 'LOCK' | 'UNLOCK',
    dto: PartnerLockDto,
  ) {
    const existing = await this.findByKey(partner, dto.idempotencyKey);
    if (existing) return this.replay(existing, deviceId, type);

    const device = await this.prisma.scoped.device.findFirst({
      where: { id: deviceId },
      select: { id: true, status: true },
    });
    if (!device) throw new NotFoundException('Device not found');
    if (NOT_COMMANDABLE.has(device.status)) {
      throw new ConflictException(`Device is ${device.status} and cannot be ${type.toLowerCase()}ed`);
    }
    if (type === 'LOCK' && device.status === DeviceStatus.LOCKED) {
      throw new ConflictException('Device is already locked');
    }
    if (type === 'UNLOCK' && device.status !== DeviceStatus.LOCKED) {
      throw new ConflictException('Device is not locked');
    }
    const pending = await this.prisma.scoped.deviceCommand.findFirst({
      where: {
        deviceId,
        type: type as CommandType,
        status: { in: [CommandStatus.QUEUED, CommandStatus.SENT] },
      },
    });
    if (pending) {
      throw new ConflictException(`A ${type.toLowerCase()} is already in progress for this device`);
    }

    try {
      const command = await this.commands.queue(deviceId, type as CommandType, {
        reason: dto.reason,
        apiClientId: partner.apiClientId,
        idempotencyKey: dto.idempotencyKey,
      });
      await this.prisma.scoped.deviceEvent.create({
        data: {
          tenantId: partner.tenantId,
          deviceId,
          type: `PARTNER_${type}_QUEUED`,
          metadata: {
            apiClientId: partner.apiClientId,
            partner: partner.name,
            commandId: command.id,
            reason: dto.reason,
          },
        },
      });
      return { command: commandView(command), replay: false };
    } catch (e) {
      // Two concurrent requests with the same key: the loser reads the winner's command.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const winner = await this.findByKey(partner, dto.idempotencyKey);
        if (winner) return this.replay(winner, deviceId, type);
      }
      throw e;
    }
  }

  // ---- helpers ------------------------------------------------------------

  private findByKey(partner: PartnerIdentity, key: string) {
    return this.prisma.scoped.deviceCommand.findFirst({
      where: { apiClientId: partner.apiClientId, idempotencyKey: key },
    });
  }

  private replay(
    existing: Prisma.DeviceCommandGetPayload<object>,
    deviceId: string,
    type: string,
  ) {
    if (existing.deviceId !== deviceId || existing.type !== type) {
      throw new ConflictException('This idempotencyKey was already used for a different request');
    }
    return { command: commandView(existing), replay: true };
  }

  private deviceView(d: Prisma.DeviceGetPayload<{ select: typeof DEVICE_SELECT }>) {
    return {
      id: d.id,
      imei: d.imei,
      serialNumber: d.serialNumber,
      make: d.make,
      model: d.model,
      status: d.status,
      lockedAt: d.lockedAt,
      lastCheckInAt: d.lastCheckInAt,
      loanStatus: d.loan?.status ?? null,
    };
  }

  private async requireClient(id: string) {
    const client = await this.prisma.apiClient.findUnique({ where: { id } });
    if (!client) throw new NotFoundException('Partner not found');
    return client;
  }

  private async assertTenantsExist(ids: string[]) {
    const found = await this.prisma.tenant.count({ where: { id: { in: ids } } });
    if (found !== ids.length) throw new BadRequestException('Unknown company in tenantIds');
  }

  private async checkWebhookUrl(url: string) {
    try {
      await assertPublicWebhookUrl(
        url,
        this.config.get('WEBHOOK_ALLOW_PRIVATE', { infer: true }) === 'true',
      );
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }
}

const DEVICE_SELECT = {
  id: true,
  imei: true,
  serialNumber: true,
  make: true,
  model: true,
  status: true,
  lockedAt: true,
  lastCheckInAt: true,
  loan: { select: { status: true } },
} satisfies Prisma.DeviceSelect;

function commandView(c: {
  id: string;
  deviceId: string;
  type: string;
  status: string;
  reason: string | null;
  createdAt: Date;
  sentAt: Date | null;
  ackedAt: Date | null;
  expiresAt: Date | null;
}) {
  return {
    id: c.id,
    deviceId: c.deviceId,
    type: c.type,
    status: c.status,
    reason: c.reason,
    createdAt: c.createdAt,
    sentAt: c.sentAt,
    ackedAt: c.ackedAt,
    expiresAt: c.expiresAt,
  };
}
