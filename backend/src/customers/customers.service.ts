import * as fs from 'fs';
import * as path from 'path';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
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

export const MAX_GUARDIANS = 5;

const RESET_VERIFICATION = {
  verificationStatus: VerificationStatus.UNVERIFIED,
  faceDistance: null,
  livenessPassed: null,
  verificationChecks: Prisma.DbNull,
  verifiedAt: null,
  verifiedById: null,
  verificationNotes: null,
};
export const REQUIRED_GUARDIANS = 3;

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

    const hasPhotos = !!customer.selfiePhotoUrl && !!customer.idCardPhotoUrl;
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
      liveness: { passed: dto.livenessPassed },
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
    if (!photo) throw new BadRequestException('Guardian photo is required');
    if (customer.guardians.length >= MAX_GUARDIANS) {
      throw new BadRequestException(
        `A customer can have at most ${MAX_GUARDIANS} guardians`,
      );
    }
    const dir = path.join(this.uploadsRoot, 'guardians', customerId);
    fs.mkdirSync(dir, { recursive: true });
    const name = `photo-${Date.now()}-${customer.guardians.length}${path.extname(photo.originalname)}`;
    fs.writeFileSync(path.join(dir, name), photo.buffer);
    return this.prisma.scoped.guardian.create({
      data: {
        ...dto,
        tenantId: customer.tenantId,
        customerId,
        photoUrl: `${this.publicBaseUrl}/uploads/guardians/${customerId}/${name}`,
      },
    });
  }

  /** Saves the customer's photo (selfie) and optional ID-card photo. */
  async savePhotos(
    id: string,
    files: { photo?: Express.Multer.File[]; idCard?: Express.Multer.File[] },
  ) {
    await this.findOne(id); // tenant-scoped existence check
    const photo = files.photo?.[0];
    const idCard = files.idCard?.[0];
    if (!photo && !idCard) throw new BadRequestException('No photo uploaded');

    const dir = path.join(this.uploadsRoot, 'kyc', id);
    fs.mkdirSync(dir, { recursive: true });
    const write = (field: string, file: Express.Multer.File) => {
      const name = `${field}-${Date.now()}${path.extname(file.originalname)}`;
      fs.writeFileSync(path.join(dir, name), file.buffer);
      return `${this.publicBaseUrl}/uploads/kyc/${id}/${name}`;
    };
    return this.prisma.scoped.customer.update({
      where: { id },
      data: {
        ...(photo ? { selfiePhotoUrl: write('selfie', photo) } : {}),
        ...(idCard ? { idCardPhotoUrl: write('idCard', idCard) } : {}),
        ...RESET_VERIFICATION, // new photos need a new check
      },
    });
  }
}
