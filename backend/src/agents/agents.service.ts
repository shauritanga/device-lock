import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DeviceStatus, LoanStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { hashPassword } from '../auth/auth.service';
import { CreateAgentDto, UpdateAgentDto } from './dto/agent.dto';

const agentSelect = {
  id: true,
  email: true,
  fullName: true,
  phone: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
} as const;

/** Owner-side management of sales agents and the phones allocated to them. */
@Injectable()
export class AgentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateAgentDto) {
    const email = dto.email.trim().toLowerCase();
    const taken = await this.prisma.user.findUnique({ where: { email } });
    if (taken) throw new ConflictException('That email is already in use');
    return this.prisma.scoped.user.create({
      data: {
        tenantId: this.prisma.currentTenantId,
        email,
        fullName: dto.fullName.trim(),
        phone: dto.phone?.trim() || null,
        passwordHash: await hashPassword(dto.password),
        role: UserRole.AGENT,
      },
      select: agentSelect,
    });
  }

  /** Every agent with how much stock they hold and what they have sold. */
  async list() {
    const agents = await this.prisma.scoped.user.findMany({
      where: { role: UserRole.AGENT },
      select: agentSelect,
      orderBy: { createdAt: 'desc' },
    });
    if (agents.length === 0) return [];
    const ids = agents.map((a) => a.id);

    const [stock, sales] = await Promise.all([
      this.prisma.scoped.device.groupBy({
        by: ['assignedAgentId'],
        where: { assignedAgentId: { in: ids }, loan: { is: null } },
        _count: { _all: true },
      }),
      this.prisma.scoped.loan.findMany({
        where: { soldById: { in: ids } },
        select: { soldById: true, principal: true, status: true },
      }),
    ]);
    const stockBy = new Map(stock.map((s) => [s.assignedAgentId, s._count._all]));

    return agents.map((a) => {
      const mine = sales.filter((l) => l.soldById === a.id);
      return {
        ...a,
        stockCount: stockBy.get(a.id) ?? 0,
        salesCount: mine.length,
        activeSales: mine.filter((l) => l.status === LoanStatus.ACTIVE).length,
        totalFinanced: mine.reduce((t, l) => t + Number(l.principal), 0),
      };
    });
  }

  async findOne(id: string) {
    const agent = await this.prisma.scoped.user.findFirst({
      where: { id, role: UserRole.AGENT },
      select: agentSelect,
    });
    if (!agent) throw new NotFoundException('Agent not found');
    const [stock, sales] = await Promise.all([
      this.prisma.scoped.device.findMany({
        where: { assignedAgentId: id, loan: { is: null } },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          imei: true,
          make: true,
          model: true,
          status: true,
          createdAt: true,
        },
      }),
      this.prisma.scoped.loan.findMany({
        where: { soldById: id },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          principal: true,
          currency: true,
          status: true,
          startDate: true,
          termMonths: true,
          termPeriods: true,
          frequency: true,
          customer: { select: { id: true, fullName: true } },
          device: {
            select: { id: true, imei: true, make: true, model: true, status: true },
          },
        },
      }),
    ]);
    return { ...agent, stock, sales };
  }

  async update(id: string, dto: UpdateAgentDto) {
    await this.findOne(id);
    const data: Record<string, unknown> = {
      fullName: dto.fullName?.trim(),
      phone: dto.phone === undefined ? undefined : dto.phone.trim() || null,
      isActive: dto.isActive,
    };
    if (dto.password) data.passwordHash = await hashPassword(dto.password);
    const updated = await this.prisma.scoped.user.update({
      where: { id },
      data,
      select: agentSelect,
    });
    if (dto.isActive === false) {
      // A deactivated agent can no longer sell: return their unsold stock to the shop.
      await this.prisma.scoped.device.updateMany({
        where: {
          assignedAgentId: id,
          loan: { is: null },
          status: DeviceStatus.PENDING_ENROLLMENT,
        },
        data: { assignedAgentId: null },
      });
    }
    return updated;
  }
}
