import * as fs from 'fs';
import * as path from 'path';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Env } from '../config/env.validation';
import { PrismaService } from '../common/prisma/prisma.service';
import { IdDocumentType, Prisma, VerificationStatus } from '@prisma/client';
import {
  CreateCustomerDto,
  CreateGuardianDto,
  ReviewCustomerDto,
  UpdateCustomerDto,
  VerifyCustomerDto,
} from './dto/customer.dto';
import { checkIdNumber, FACE_MATCH_MAX, FACE_REVIEW_MAX } from './id-rules';
import { randomToken, sha256 } from '../common/crypto.util';
import { VerificationIdentity } from '../common/guards/verification-session.guard';

export const MAX_GUARDIANS = 3;

const RESET_VERIFICATION = {
  verificationStatus: VerificationStatus.UNVERIFIED,
  faceDistance: null,
  livenessPassed: null,
  verificationChecks: Prisma.DbNull,
  verifiedAt: null,
  verifiedById: null,
  verificationNotes: null,
};
/** One guardian is required before a credit sale; up to MAX_GUARDIANS can be added. */
export const REQUIRED_GUARDIANS = 1;

@Injectable()
export class CustomersService {
  private readonly publicBaseUrl: string;
  private readonly uploadsRoot = path.join(__dirname, '..', '..', 'uploads');

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<Env, true>,
  ) {
    this.publicBaseUrl = (
      config.get('PUBLIC_BASE_URL', { infer: true }) ?? 'http://localhost:3000'
    ).replace(/\/$/, '');
  }

  create(dto: CreateCustomerDto) {
    this.assertIdFormat(dto.idDocumentType, dto.nationalId);
    return this.prisma.scoped.customer.create({
      data: { ...dto, tenantId: this.prisma.currentTenantId },
    });
  }

  findAll() {
    return this.prisma.scoped.customer.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { guardians: true } } },
    });
  }

  async findOne(id: string) {
    const customer = await this.prisma.scoped.customer.findFirst({
      where: { id },
      include: { devices: true, loans: true, guardians: true },
    });
    if (!customer) throw new NotFoundException('Customer not found');
    return customer;
  }

  async update(id: string, dto: UpdateCustomerDto) {
    const current = await this.findOne(id);
    const idType = dto.idDocumentType ?? current.idDocumentType;
    const idNumber = dto.nationalId ?? current.nationalId;
    if ((dto.idDocumentType || dto.nationalId) && idType && idNumber) {
      this.assertIdFormat(idType, idNumber);
    }
    // Changing who the customer is invalidates earlier checks.
    const identityChanged =
      (dto.nationalId !== undefined && dto.nationalId !== current.nationalId) ||
      (dto.idDocumentType !== undefined && dto.idDocumentType !== current.idDocumentType) ||
      (dto.fullName !== undefined && dto.fullName !== current.fullName);
    return this.prisma.scoped.customer.update({
      where: { id },
      data: { ...dto, ...(identityChanged ? RESET_VERIFICATION : {}) },
    });
  }

  private assertIdFormat(type: IdDocumentType, number: string) {
    const check = checkIdNumber(type, number);
    if (!check.valid) throw new BadRequestException(check.reason);
  }

  /**
   * Runs the onboarding checks and stores the outcome. The face distance and
   * liveness result come from the browser (the live camera session runs there);
   * the format, duplicate and photo checks are done here.
   */
  async verify(id: string, dto: VerifyCustomerDto, actorId: string) {
    const customer = await this.findOne(id);

    const idCheck =
      customer.nationalId && customer.idDocumentType
        ? checkIdNumber(customer.idDocumentType, customer.nationalId)
        : { valid: false, reason: 'No ID number on file', normalized: '' };

    let duplicateOf: string | null = null;
    if (idCheck.valid && customer.idDocumentType) {
      const sameType = await this.prisma.scoped.customer.findMany({
        where: {
          id: { not: id },
          idDocumentType: customer.idDocumentType,
          nationalId: { not: null },
        },
        select: { id: true, fullName: true, nationalId: true },
      });
      const dup = sameType.find(
        (c) =>
          c.nationalId &&
          checkIdNumber(customer.idDocumentType!, c.nationalId).normalized === idCheck.normalized,
      );
      duplicateOf = dup ? dup.fullName : null;
    }

    const hasPhotos =
      !!customer.selfiePhotoUrl && !!customer.idCardPhotoUrl && !!customer.idCardBackPhotoUrl;
    const faceOk = dto.faceDistance <= FACE_MATCH_MAX;
    const faceBorderline = dto.faceDistance > FACE_MATCH_MAX && dto.faceDistance <= FACE_REVIEW_MAX;

    let status: VerificationStatus;
    if (!idCheck.valid || duplicateOf || !hasPhotos) status = VerificationStatus.FAILED;
    else if (faceOk && dto.livenessPassed) status = VerificationStatus.VERIFIED;
    else if (faceBorderline || (faceOk && !dto.livenessPassed)) status = VerificationStatus.NEEDS_REVIEW;
    else status = VerificationStatus.FAILED;

    const checks: Prisma.InputJsonObject = {
      idFormat: { passed: idCheck.valid, reason: idCheck.reason ?? null },
      duplicateId: { passed: !duplicateOf, matches: duplicateOf },
      photos: { passed: hasPhotos },
      liveness: { passed: dto.livenessPassed, info: parseInfo(dto.livenessInfo) },
      face: {
        passed: faceOk,
        distance: dto.faceDistance,
        matchBelow: FACE_MATCH_MAX,
        reviewBelow: FACE_REVIEW_MAX,
      },
    };

    return this.prisma.scoped.customer.update({
      where: { id },
      data: {
        verificationStatus: status,
        faceDistance: dto.faceDistance,
        livenessPassed: dto.livenessPassed,
        verificationChecks: checks,
        verifiedAt: new Date(),
        verifiedById: actorId,
        verificationNotes: null,
      },
    });
  }

  /** A manager's decision on a customer the automatic checks could not settle. */
  async review(id: string, dto: ReviewCustomerDto, actorId: string) {
    await this.findOne(id);
    return this.prisma.scoped.customer.update({
      where: { id },
      data: {
        verificationStatus: dto.decision,
        verifiedAt: new Date(),
        verifiedById: actorId,
        verificationNotes: dto.notes?.trim() || null,
      },
    });
  }

  async addGuardian(
    customerId: string,
    dto: CreateGuardianDto,
    photo: Express.Multer.File | undefined,
  ) {
    const customer = await this.findOne(customerId);
    if (customer.guardians.length >= MAX_GUARDIANS) {
      throw new BadRequestException(
        `A customer can have at most ${MAX_GUARDIANS} guardians`,
      );
    }
    let photoUrl: string | null = null;
    if (photo) {
      const dir = path.join(this.uploadsRoot, 'guardians', customerId);
      fs.mkdirSync(dir, { recursive: true });
      const name = `photo-${Date.now()}-${customer.guardians.length}${path.extname(photo.originalname)}`;
      fs.writeFileSync(path.join(dir, name), photo.buffer);
      photoUrl = `${this.publicBaseUrl}/uploads/guardians/${customerId}/${name}`;
    }
    return this.prisma.scoped.guardian.create({
      data: {
        ...dto,
        tenantId: customer.tenantId,
        customerId,
        photoUrl,
      },
    });
  }

  /** Stores one verification photo and invalidates any earlier result. */
  private async savePhoto(
    customerId: string,
    kind: 'selfie' | 'idFront' | 'idBack',
    file: Express.Multer.File | undefined,
  ) {
    if (!file) throw new BadRequestException('No photo received');
    const dir = path.join(this.uploadsRoot, 'kyc', customerId);
    fs.mkdirSync(dir, { recursive: true });
    const name = `${kind}-${Date.now()}${path.extname(file.originalname) || '.jpg'}`;
    fs.writeFileSync(path.join(dir, name), file.buffer);
    const url = `${this.publicBaseUrl}/uploads/kyc/${customerId}/${name}`;
    const field =
      kind === 'selfie' ? 'selfiePhotoUrl' : kind === 'idFront' ? 'idCardPhotoUrl' : 'idCardBackPhotoUrl';
    await this.prisma.scoped.customer.update({
      where: { id: customerId },
      data: { [field]: url, ...RESET_VERIFICATION },
    });
  }

  // ---- Phone verification sessions -------------------------------------

  /** Staff starts a verification: returns the one-time token to put in a QR code. */
  async createVerificationSession(customerId: string, actorId: string) {
    const customer = await this.findOne(customerId);
    if (!customer.nationalId || !customer.idDocumentType) {
      throw new BadRequestException('Add the customer\'s ID number before verifying');
    }
    // Only one live link per customer.
    await this.prisma.scoped.verificationSession.updateMany({
      where: { customerId, completedAt: null, cancelledAt: null },
      data: { cancelledAt: new Date() },
    });
    const token = randomToken(32);
    const session = await this.prisma.scoped.verificationSession.create({
      data: {
        tenantId: customer.tenantId,
        customerId,
        tokenHash: sha256(token),
        createdById: actorId,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      },
    });
    return { id: session.id, token, expiresAt: session.expiresAt };
  }

  /** Progress of a session, polled by the staff screen while the phone works. */
  async verificationSessionStatus(customerId: string, sessionId: string) {
    const session = await this.prisma.scoped.verificationSession.findFirst({
      where: { id: sessionId, customerId },
    });
    if (!session) throw new NotFoundException('Verification not found');
    const expired = !session.completedAt && session.expiresAt.getTime() < Date.now();
    const customer = session.completedAt
      ? await this.prisma.scoped.customer.findFirst({
          where: { id: customerId },
          select: {
            id: true,
            verificationStatus: true,
            verificationChecks: true,
            faceDistance: true,
            selfiePhotoUrl: true,
            idCardPhotoUrl: true,
            idCardBackPhotoUrl: true,
          },
        })
      : null;
    return {
      id: session.id,
      idFront: !!session.idFrontAt,
      idBack: !!session.idBackAt,
      completed: !!session.completedAt,
      cancelled: !!session.cancelledAt,
      expired,
      expiresAt: session.expiresAt,
      result: customer,
    };
  }

  async cancelVerificationSession(customerId: string, sessionId: string) {
    await this.prisma.scoped.verificationSession.updateMany({
      where: { id: sessionId, customerId, completedAt: null },
      data: { cancelledAt: new Date() },
    });
    return { ok: true };
  }

  // ---- What the phone does with its link --------------------------------

  async phoneSessionInfo(v: VerificationIdentity) {
    const [customer, session] = await Promise.all([
      this.prisma.scoped.customer.findFirst({
        where: { id: v.customerId },
        select: { fullName: true },
      }),
      this.prisma.scoped.verificationSession.findFirst({ where: { id: v.sessionId } }),
    ]);
    return {
      customerName: customer?.fullName ?? '',
      expiresAt: session?.expiresAt,
      idFront: !!session?.idFrontAt,
      idBack: !!session?.idBackAt,
    };
  }

  async phoneSaveId(v: VerificationIdentity, side: 'front' | 'back', file?: Express.Multer.File) {
    await this.savePhoto(v.customerId, side === 'front' ? 'idFront' : 'idBack', file);
    await this.prisma.scoped.verificationSession.update({
      where: { id: v.sessionId },
      data: side === 'front' ? { idFrontAt: new Date() } : { idBackAt: new Date() },
    });
    return { ok: true };
  }

  /** The live check is the last step: store the selfie, score the whole verification, close the link. */
  async phoneComplete(
    v: VerificationIdentity,
    selfie: Express.Multer.File | undefined,
    dto: VerifyCustomerDto,
  ) {
    const session = await this.prisma.scoped.verificationSession.findFirst({
      where: { id: v.sessionId },
    });
    if (!session?.idFrontAt || !session.idBackAt) {
      throw new ConflictException('Take the front and back of the ID first');
    }
    await this.savePhoto(v.customerId, 'selfie', selfie);
    const customer = await this.verify(v.customerId, dto, v.createdById);
    await this.prisma.scoped.verificationSession.update({
      where: { id: v.sessionId },
      data: { completedAt: new Date() },
    });
    return { status: customer.verificationStatus };
  }
}

/** The phone's blink-detector measurements: numbers and booleans only, kept small. */
function parseInfo(raw?: string): Prisma.InputJsonObject | null {
  if (!raw || raw.length > 2000) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, number | boolean> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'number' || typeof v === 'boolean') out[k] = v;
    }
    return out;
  } catch {
    return null;
  }
}
