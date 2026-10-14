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
import { CreateCustomerDto, UpdateCustomerDto } from './dto/customer.dto';

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
    return this.prisma.scoped.customer.create({
      data: { ...dto, tenantId: this.prisma.currentTenantId },
    });
  }

  findAll() {
    return this.prisma.scoped.customer.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const customer = await this.prisma.scoped.customer.findFirst({
      where: { id },
      include: { devices: true, loans: true },
    });
    if (!customer) throw new NotFoundException('Customer not found');
    return customer;
  }

  async update(id: string, dto: UpdateCustomerDto) {
    await this.findOne(id);
    return this.prisma.scoped.customer.update({ where: { id }, data: dto });
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
      },
    });
  }
}
