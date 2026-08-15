import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CollectionsPackage,
  CollectionsSubscriptionStatus,
  DemoRequestStatus,
  UserRole,
} from '@prisma/client';
import { randomBytes } from 'crypto';
import { hashPassword } from '../auth/auth.service';
import { PrismaService } from '../common/prisma/prisma.service';
import type { Env } from '../config/env.validation';
import { COLLECTIONS_PACKAGES } from '../collections/packages';
import { EmailService } from '../notifications/email.service';
import {
  ConvertDemoRequestDto,
  CreateDemoRequestDto,
  UpdateDemoRequestDto,
} from './dto/demo-request.dto';

const publicSelect = {
  id: true,
  status: true,
  createdAt: true,
} as const;

const adminSelect = {
  id: true,
  fullName: true,
  companyName: true,
  phone: true,
  email: true,
  devicesPerMonth: true,
  suggestedPackage: true,
  message: true,
  status: true,
  adminNotes: true,
  convertedTenantId: true,
  source: true,
  createdAt: true,
  updatedAt: true,
  contactedAt: true,
  convertedTenant: { select: { id: true, name: true, isActive: true } },
} as const;

/** Map website device-band labels to a billing / collections package hint. */
export function suggestPackage(devicesPerMonth?: string | null): string | null {
  if (!devicesPerMonth) return null;
  const v = devicesPerMonth.toLowerCase();
  if (v.includes('fewer') || v.includes('<') || v.startsWith('fewer')) return 'STARTER';
  if (v.includes('30') && v.includes('44')) return 'GROWTH';
  if (v.includes('45') && v.includes('55')) return 'BUSINESS';
  if (v.includes('more') || v.includes('55+') || v.includes('enterprise')) {
    return 'ENTERPRISE';
  }
  return null;
}

function toCollectionsPackage(code?: string | null): CollectionsPackage {
  if (code === 'GROWTH') return CollectionsPackage.GROWTH;
  if (code === 'BUSINESS' || code === 'ENTERPRISE') {
    return CollectionsPackage.BUSINESS;
  }
  return CollectionsPackage.STARTER;
}

/** Readable temporary password for first login (never stored in plaintext). */
function generateTemporaryPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = randomBytes(12);
  let out = '';
  for (let i = 0; i < 12; i++) {
    out += alphabet[bytes[i]! % alphabet.length];
  }
  return out;
}

@Injectable()
export class DemoRequestsService {
  private readonly logger = new Logger(DemoRequestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /**
   * Public intake from the marketing site. Soft-dedupes by phone within 24h so
   * double-submits don't spam the queue. Sends an acknowledgment email when an
   * address is provided.
   */
  async create(dto: CreateDemoRequestDto, userAgent?: string) {
    const phone = dto.phone.trim();
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const existing = await this.prisma.demoRequest.findFirst({
      where: {
        phone,
        createdAt: { gte: since },
        status: { in: [DemoRequestStatus.NEW, DemoRequestStatus.CONTACTED] },
      },
      orderBy: { createdAt: 'desc' },
      select: { ...publicSelect, email: true, fullName: true, companyName: true },
    });
    if (existing) {
      if (existing.email) {
        void this.email
          .sendDemoRequestReceived({
            to: existing.email,
            fullName: existing.fullName,
            companyName: existing.companyName,
          })
          .catch((e) =>
            this.logger.warn(
              `Ack email (duplicate) failed: ${e instanceof Error ? e.message : e}`,
            ),
          );
      }
      return {
        id: existing.id,
        status: existing.status,
        createdAt: existing.createdAt,
        duplicate: true as const,
      };
    }

    const email = dto.email?.trim().toLowerCase() || null;
    const created = await this.prisma.demoRequest.create({
      data: {
        fullName: dto.fullName.trim(),
        companyName: dto.companyName.trim(),
        phone,
        email,
        devicesPerMonth: dto.devicesPerMonth?.trim() || null,
        suggestedPackage: suggestPackage(dto.devicesPerMonth),
        message: dto.message?.trim() || null,
        userAgent: userAgent?.slice(0, 500) || null,
      },
      select: {
        ...publicSelect,
        email: true,
        fullName: true,
        companyName: true,
      },
    });

    if (created.email) {
      void this.email
        .sendDemoRequestReceived({
          to: created.email,
          fullName: created.fullName,
          companyName: created.companyName,
        })
        .catch((e) =>
          this.logger.warn(
            `Ack email failed: ${e instanceof Error ? e.message : e}`,
          ),
        );
    }

    return {
      id: created.id,
      status: created.status,
      createdAt: created.createdAt,
      duplicate: false as const,
    };
  }

  findAll(status?: DemoRequestStatus) {
    return this.prisma.demoRequest.findMany({
      where: status ? { status } : undefined,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      select: adminSelect,
    });
  }

  async findOne(id: string) {
    const row = await this.prisma.demoRequest.findUnique({
      where: { id },
      select: adminSelect,
    });
    if (!row) throw new NotFoundException('Demo request not found');
    return row;
  }

  async update(id: string, dto: UpdateDemoRequestDto) {
    await this.findOne(id);
    const data: {
      status?: DemoRequestStatus;
      adminNotes?: string;
      email?: string;
      contactedAt?: Date;
    } = {};
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.adminNotes !== undefined) data.adminNotes = dto.adminNotes;
    if (dto.email !== undefined) data.email = dto.email.trim().toLowerCase();
    if (
      dto.status === DemoRequestStatus.CONTACTED ||
      dto.status === DemoRequestStatus.QUALIFIED
    ) {
      data.contactedAt = new Date();
    }
    return this.prisma.demoRequest.update({
      where: { id },
      data,
      select: adminSelect,
    });
  }

  /**
   * Create a seller Tenant + OWNER login + pending collections package from the
   * lead, email welcome credentials, then mark the request CONVERTED.
   */
  async convert(id: string, dto: ConvertDemoRequestDto) {
    const lead = await this.findOne(id);
    if (lead.status === DemoRequestStatus.CLOSED) {
      throw new BadRequestException('Closed demo requests cannot be converted');
    }
    if (lead.convertedTenantId) {
      throw new BadRequestException('Demo request already converted to a tenant');
    }

    const ownerEmail = (dto.ownerEmail || lead.email || '').trim().toLowerCase();
    if (!ownerEmail) {
      throw new BadRequestException(
        'An email is required to create the client portal login. Add it on the lead first.',
      );
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { email: ownerEmail },
      select: { id: true },
    });
    if (existingUser) {
      throw new BadRequestException(
        `A user with email ${ownerEmail} already exists. Use a different address.`,
      );
    }

    const packageCode = toCollectionsPackage(
      dto.billingPlan || lead.suggestedPackage || 'STARTER',
    );
    const def = COLLECTIONS_PACKAGES[packageCode];
    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);
    const tenantName = (dto.tenantName || lead.companyName).trim();
    const portalUrl = (
      this.config.get('CLIENT_APP_URL', { infer: true }) ??
      'https://client.linda.co.tz'
    ).replace(/\/$/, '');

    const converted = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: tenantName,
          billingPlan: packageCode,
          subscriptionStatus: 'PENDING',
        },
      });

      await tx.collectionsSubscription.create({
        data: {
          tenantId: tenant.id,
          packageCode,
          status: CollectionsSubscriptionStatus.PENDING,
          deviceBandMin: def.deviceBandMin,
          deviceBandMax: def.deviceBandMax,
          priceModel: def.priceModel,
          unitPrice: def.unitPrice,
          flatPrice: def.flatPrice,
          currency: def.currency,
          notes: lead.devicesPerMonth
            ? `From demo request: ${lead.devicesPerMonth} devices/month`
            : 'Created from website demo request',
        },
      });

      await tx.user.create({
        data: {
          tenantId: tenant.id,
          email: ownerEmail,
          fullName: lead.fullName.trim(),
          role: UserRole.OWNER,
          passwordHash,
          phone: lead.phone,
        },
      });

      // Keep lead email in sync if admin supplied ownerEmail at convert time.
      const leadUpdate: {
        status: DemoRequestStatus;
        convertedTenantId: string;
        contactedAt: Date;
        email?: string;
      } = {
        status: DemoRequestStatus.CONVERTED,
        convertedTenantId: tenant.id,
        contactedAt: lead.contactedAt ?? new Date(),
      };
      if (!lead.email || lead.email !== ownerEmail) {
        leadUpdate.email = ownerEmail;
      }

      return tx.demoRequest.update({
        where: { id },
        data: leadUpdate,
        select: adminSelect,
      });
    });

    const emailSent = await this.email.sendClientWelcome({
      to: ownerEmail,
      fullName: lead.fullName,
      companyName: tenantName,
      email: ownerEmail,
      temporaryPassword,
      portalUrl,
    });

    if (!emailSent) {
      this.logger.warn(
        `Welcome email not delivered for ${ownerEmail} — credentials returned in API for admin to share`,
      );
    }

    return {
      ...converted,
      ownerAccount: {
        email: ownerEmail,
        temporaryPassword,
        portalUrl,
        emailSent,
      },
    };
  }
}
