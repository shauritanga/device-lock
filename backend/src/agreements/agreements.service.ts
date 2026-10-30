import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AgreementStatus, ServiceAgreement } from '@prisma/client';
import { createHash } from 'crypto';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../common/prisma/prisma.service';
import { EmailService } from '../notifications/email.service';
import {
  AGREEMENT_TERMS_VERSION,
  AgreementContent,
  renderAgreement,
} from './agreement.template';
import {
  CreateAgreementDto,
  SignAgreementDto,
  UpdateAgreementDto,
} from './dto/agreement.dto';

/** Statuses in which an agreement still occupies the tenant's single live slot. */
const LIVE: AgreementStatus[] = ['DRAFT', 'SENT', 'CLIENT_SIGNED', 'ACTIVE'];

export type SignContext = { ip?: string; userAgent?: string };

/** JSON with recursively sorted keys. Postgres jsonb does not preserve key order. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function hashContent(content: AgreementContent): string {
  return createHash('sha256').update(canonical(content)).digest('hex');
}

/**
 * Service agreement lifecycle: DRAFT → SENT → CLIENT_SIGNED → ACTIVE (or VOID).
 *
 * ServiceAgreement is deliberately not in TENANT_SCOPED_MODELS: platform admins work
 * across tenants, so every query here filters tenantId explicitly. Tenant users only
 * ever reach the `*ForTenant` methods, which pin the id to the caller's own tenant.
 */
@Injectable()
export class AgreementsService {
  private readonly logger = new Logger(AgreementsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {}

  // ---- platform admin ---------------------------------------------------

  async create(dto: CreateAgreementDto, actor: AuthUser) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: dto.tenantId } });
    if (!tenant) throw new NotFoundException('Company not found');

    const live = await this.prisma.serviceAgreement.findFirst({
      where: { tenantId: dto.tenantId, status: { in: LIVE } },
    });
    if (live) {
      throw new ConflictException(
        'This company already has an agreement in progress. Void it before creating a new one.',
      );
    }

    const feePerDevice = dto.feePerDevice ?? 5000;
    const content = renderAgreement({ ...dto, feePerDevice });
    return this.prisma.serviceAgreement.create({
      data: {
        tenantId: dto.tenantId,
        termsVersion: AGREEMENT_TERMS_VERSION,
        content: content as object,
        contentHash: hashContent(content),
        feePerDevice,
        providerName: dto.providerName,
        providerAddress: dto.providerAddress,
        providerEmail: dto.providerEmail,
        providerPhone: dto.providerPhone,
        clientName: dto.clientName,
        clientAddress: dto.clientAddress,
        clientEmail: dto.clientEmail,
        clientPhone: dto.clientPhone,
        createdById: actor.userId,
      },
    });
  }

  listForTenant(tenantId: string) {
    return this.prisma.serviceAgreement.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      select: SUMMARY_SELECT,
    });
  }

  async findOne(id: string) {
    const row = await this.prisma.serviceAgreement.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Agreement not found');
    return row;
  }

  async update(id: string, dto: UpdateAgreementDto) {
    const row = await this.findOne(id);
    if (row.status !== 'DRAFT') {
      throw new ConflictException('Only draft agreements can be edited');
    }
    const merged = {
      providerName: dto.providerName ?? row.providerName,
      providerAddress: dto.providerAddress ?? row.providerAddress,
      providerEmail: dto.providerEmail ?? row.providerEmail,
      providerPhone: dto.providerPhone ?? row.providerPhone,
      clientName: dto.clientName ?? row.clientName,
      clientAddress: dto.clientAddress ?? row.clientAddress,
      clientEmail: dto.clientEmail ?? row.clientEmail,
      clientPhone: dto.clientPhone ?? row.clientPhone,
      feePerDevice: dto.feePerDevice ?? row.feePerDevice,
    };
    const content = renderAgreement(merged);
    return this.prisma.serviceAgreement.update({
      where: { id },
      data: { ...merged, content: content as object, contentHash: hashContent(content) },
    });
  }

  async send(id: string) {
    const row = await this.findOne(id);
    if (row.status !== 'DRAFT' && row.status !== 'SENT') {
      throw new ConflictException('Only a draft agreement can be sent');
    }
    const updated = await this.prisma.serviceAgreement.update({
      where: { id },
      data: { status: 'SENT', sentAt: new Date() },
    });
    await this.notifyClient(updated);
    return updated;
  }

  async countersign(id: string, dto: SignAgreementDto, actor: AuthUser) {
    const row = await this.findOne(id);
    if (row.status !== 'CLIENT_SIGNED') {
      throw new ConflictException(
        row.status === 'ACTIVE'
          ? 'Agreement is already fully signed'
          : 'The client must sign before it can be countersigned',
      );
    }
    const now = new Date();
    return this.prisma.serviceAgreement.update({
      where: { id },
      data: {
        status: 'ACTIVE',
        activatedAt: now,
        providerSignatoryName: dto.signatoryName,
        providerSignatoryTitle: dto.signatoryTitle,
        providerSignature: dto.signature,
        providerSignedAt: now,
        providerSignedById: actor.userId,
        providerWitnessName: dto.witnessName,
        providerWitnessSignature: dto.witnessSignature,
      },
    });
  }

  async voidAgreement(id: string, reason?: string) {
    const row = await this.findOne(id);
    if (row.status === 'VOID') return row;
    return this.prisma.serviceAgreement.update({
      where: { id },
      data: { status: 'VOID', voidedAt: new Date(), voidReason: reason },
    });
  }

  // ---- client company ---------------------------------------------------

  /** The company's current agreement, or null. Drafts are never shown to the client. */
  async currentForTenant(tenantId: string) {
    const row = await this.prisma.serviceAgreement.findFirst({
      where: { tenantId, status: { in: ['SENT', 'CLIENT_SIGNED', 'ACTIVE'] } },
      orderBy: { createdAt: 'desc' },
    });
    return row;
  }

  async signForTenant(
    tenantId: string,
    id: string,
    dto: SignAgreementDto,
    actor: AuthUser,
    ctx: SignContext,
  ) {
    const row = await this.prisma.serviceAgreement.findFirst({ where: { id, tenantId } });
    if (!row || row.status === 'DRAFT' || row.status === 'VOID') {
      throw new NotFoundException('Agreement not found');
    }
    if (row.status !== 'SENT') {
      throw new ConflictException('This agreement has already been signed');
    }
    if (hashContent(row.content as unknown as AgreementContent) !== row.contentHash) {
      // Should be impossible; refuse to bind a client to text that no longer matches its hash.
      throw new BadRequestException('Agreement text failed its integrity check');
    }
    const now = new Date();
    return this.prisma.serviceAgreement.update({
      where: { id },
      data: {
        status: 'CLIENT_SIGNED',
        clientSignatoryName: dto.signatoryName,
        clientSignatoryTitle: dto.signatoryTitle,
        clientSignature: dto.signature,
        clientSignedAt: now,
        clientSignedById: actor.userId,
        clientSignedIp: ctx.ip?.slice(0, 64),
        clientSignedAgent: ctx.userAgent?.slice(0, 300),
        clientWitnessName: dto.witnessName,
        clientWitnessSignature: dto.witnessSignature,
      },
    });
  }

  /** Throws unless the tenant may enroll devices (no agreement pending completion). */
  async assertCanEnroll(tenantId: string) {
    const pending = await this.prisma.serviceAgreement.findFirst({
      where: { tenantId, status: { in: ['SENT', 'CLIENT_SIGNED'] } },
      select: { status: true },
    });
    if (pending) {
      throw new ForbiddenException(
        pending.status === 'SENT'
          ? 'Sign the service agreement before enrolling devices'
          : 'Waiting for the service agreement to be countersigned before enrolling devices',
      );
    }
  }

  private async notifyClient(row: ServiceAgreement) {
    const subject = `Service agreement for ${row.clientName} — please review and sign`;
    const text = `Hello,\n\n${row.providerName} has issued a service agreement for ${row.clientName}. Sign in to your seller console and open "Agreement" to review and sign it.\n\nIf you did not expect this message, please ignore it.`;
    const html = `<p>Hello,</p><p><strong>${esc(row.providerName)}</strong> has issued a service agreement for <strong>${esc(row.clientName)}</strong>. Sign in to your seller console and open <em>Agreement</em> to review and sign it.</p><p>If you did not expect this message, please ignore it.</p>`;
    try {
      await this.email.send({ to: row.clientEmail, subject, html, text });
    } catch (err) {
      this.logger.warn(`Agreement email failed for ${row.id}: ${String(err)}`);
    }
  }
}

const SUMMARY_SELECT = {
  id: true,
  tenantId: true,
  status: true,
  termsVersion: true,
  feePerDevice: true,
  clientName: true,
  sentAt: true,
  activatedAt: true,
  voidedAt: true,
  clientSignedAt: true,
  providerSignedAt: true,
  createdAt: true,
} as const;

function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
}
