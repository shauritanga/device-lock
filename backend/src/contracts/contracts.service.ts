import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateContractDto } from './dto/contract.dto';

@Injectable()
export class ContractsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateContractDto, acceptedBy: string) {
    const loan = await this.prisma.scoped.loan.findFirst({
      where: { id: dto.loanId },
      include: { contract: true },
    });
    if (!loan) throw new NotFoundException('Loan not found');
    if (loan.contract) throw new ConflictException('Contract already exists for loan');

    return this.prisma.scoped.contract.create({
      data: {
        tenantId: loan.tenantId,
        customerId: loan.customerId,
        loanId: loan.id,
        acceptedBy,
        language: dto.language ?? 'en',
        termsVersion: dto.termsVersion ?? 'simulinda-v1',
        termsText: dto.termsText,
        metadata: dto.metadata as Prisma.InputJsonValue | undefined,
      },
      include: { customer: true, loan: { include: { device: true } } },
    });
  }

  findAll() {
    return this.prisma.scoped.contract.findMany({
      orderBy: { acceptedAt: 'desc' },
      include: { customer: true, loan: { include: { device: true } } },
    });
  }

  async findOne(id: string) {
    const contract = await this.prisma.scoped.contract.findFirst({
      where: { id },
      include: { customer: true, loan: { include: { device: true } } },
    });
    if (!contract) throw new NotFoundException('Contract not found');
    return contract;
  }
}
