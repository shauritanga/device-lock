import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { hashPassword } from '../auth/auth.service';
import { AuthUser } from '../auth/auth.types';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';

// Fields safe to return (never the password hash).
const publicSelect = {
  id: true,
  tenantId: true,
  email: true,
  fullName: true,
  role: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateUserDto, actor: AuthUser) {
    const passwordHash = await hashPassword(dto.password);
    const base = {
      email: dto.email,
      fullName: dto.fullName,
      role: dto.role as unknown as UserRole,
      passwordHash,
    };

    if (actor.role === UserRole.SUPER_ADMIN) {
      if (!dto.tenantId) {
        throw new BadRequestException('tenantId is required for SUPER_ADMIN');
      }
      // Explicit tenant; use the unscoped client (no CLS tenant for super admin).
      return this.prisma.user.create({
        data: { ...base, tenantId: dto.tenantId },
        select: publicSelect,
      });
    }

    // Tenant staff: scope to the caller's tenant.
    return this.prisma.scoped.user.create({
      data: { ...base, tenantId: this.prisma.currentTenantId },
      select: publicSelect,
    });
  }

  findAll() {
    return this.prisma.scoped.user.findMany({
      select: publicSelect,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.scoped.user.findFirst({
      where: { id },
      select: publicSelect,
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async update(id: string, dto: UpdateUserDto) {
    await this.findOne(id); // tenant-scoped existence check
    const data: Record<string, unknown> = {
      fullName: dto.fullName,
      role: dto.role as unknown as UserRole | undefined,
      isActive: dto.isActive,
    };
    if (dto.password) data.passwordHash = await hashPassword(dto.password);

    return this.prisma.scoped.user.update({
      where: { id },
      data,
      select: publicSelect,
    });
  }

  /** Soft-disable rather than delete, to preserve audit/command history. */
  async deactivate(id: string) {
    await this.findOne(id);
    return this.prisma.scoped.user.update({
      where: { id },
      data: { isActive: false },
      select: publicSelect,
    });
  }
}
