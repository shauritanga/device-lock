import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { LoanStatus, PaymentFrequency, UserRole } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../common/prisma/prisma.service';
import { REQUIRED_GUARDIANS } from '../customers/customers.service';
import { CreateLoanDto } from './dto/loan.dto';
import { approxMonths, generateSchedule } from './installment.util';

@Injectable()
export class LoansService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateLoanDto, actor?: AuthUser) {
    const downPayment = dto.downPayment ?? 0;
    const interestRate = dto.interestRate ?? 0;
    if (downPayment >= dto.principal) {
      throw new BadRequestException('downPayment must be less than principal');
    }

    // Validate referenced entities exist within the caller's tenant.
    const customer = await this.prisma.scoped.customer.findFirst({
      where: { id: dto.customerId },
      include: { _count: { select: { guardians: true } } },
    });
    if (!customer) throw new NotFoundException('Customer not found');
    if (customer._count.guardians < REQUIRED_GUARDIANS) {
      throw new BadRequestException(
        `Customer needs ${REQUIRED_GUARDIANS} guardians before a loan can be created`,
      );
    }

    const device = await this.prisma.scoped.device.findFirst({
      where: { id: dto.deviceId },
      include: { loan: true },
    });
    if (!device) throw new NotFoundException('Device not found');
    if (device.loan) {
      throw new ConflictException('Device already has a loan');
    }
    // Agents may only sell phones the owner allocated to them.
    if (
      actor?.role === UserRole.AGENT &&
      device.assignedAgentId !== actor.userId
    ) {
      throw new ForbiddenException('This phone is not assigned to you');
    }

    const frequency = dto.frequency ?? PaymentFrequency.MONTHLY;
    if (frequency === PaymentFrequency.MONTHLY && dto.termPeriods > 60) {
      throw new BadRequestException('Monthly loans are limited to 60 months');
    }
    const startDate = dto.startDate ? new Date(dto.startDate) : new Date();
    const schedule = generateSchedule({
      principal: dto.principal,
      downPayment,
      interestRatePct: interestRate,
      termPeriods: dto.termPeriods,
      frequency,
      startDate,
    });

    return this.prisma.scoped.$transaction(async (tx) => {
      const loan = await tx.loan.create({
        data: {
          tenantId: customer.tenantId,
          customerId: dto.customerId,
          deviceId: dto.deviceId,
          soldById: actor?.userId,
          principal: dto.principal,
          downPayment,
          interestRate,
          termMonths: approxMonths(dto.termPeriods, frequency),
          termPeriods: dto.termPeriods,
          frequency,
          currency: dto.currency ?? 'TZS',
          startDate,
          status: LoanStatus.ACTIVE,
          installments: {
            create: schedule.lines.map((l) => ({
              tenantId: customer.tenantId,
              sequence: l.sequence,
              dueDate: l.dueDate,
              amount: l.amount,
            })),
          },
        },
        include: { installments: { orderBy: { sequence: 'asc' } } },
      });

      // Link the device to the customer if not already set.
      if (device.customerId !== dto.customerId) {
        await tx.device.update({
          where: { id: dto.deviceId },
          data: { customerId: dto.customerId },
        });
      }

      return {
        ...loan,
        summary: {
          financed: schedule.financed,
          totalInterest: schedule.totalInterest,
          totalRepayable: schedule.totalRepayable,
        },
      };
    });
  }

  /** Agents only see the sales they made themselves. */
  private scope(actor?: AuthUser) {
    return actor?.role === UserRole.AGENT ? { soldById: actor.userId } : {};
  }

  findAll(actor?: AuthUser) {
    return this.prisma.scoped.loan.findMany({
      where: this.scope(actor),
      orderBy: { createdAt: 'desc' },
      include: {
        customer: true,
        device: true,
        contract: true,
        soldBy: { select: { id: true, fullName: true, role: true } },
      },
    });
  }

  async findOne(id: string, actor?: AuthUser) {
    const loan = await this.prisma.scoped.loan.findFirst({
      where: { id, ...this.scope(actor) },
      include: {
        soldBy: { select: { id: true, fullName: true, role: true } },
        customer: true,
        device: true,
        contract: true,
        installments: { orderBy: { sequence: 'asc' } },
      },
    });
    if (!loan) throw new NotFoundException('Loan not found');
    return loan;
  }

  async installments(id: string, actor?: AuthUser) {
    await this.findOne(id, actor);
    return this.prisma.scoped.installment.findMany({
      where: { loanId: id },
      orderBy: { sequence: 'asc' },
    });
  }

  async cancel(id: string) {
    const loan = await this.findOne(id);
    if (loan.status !== LoanStatus.ACTIVE) {
      throw new BadRequestException('Only ACTIVE loans can be cancelled');
    }
    return this.prisma.scoped.loan.update({
      where: { id },
      data: { status: LoanStatus.CANCELLED },
    });
  }
}
