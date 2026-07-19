import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InstallmentStatus, LoanStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { CallProviderService } from './call-provider.service';
import {
  CallProviderCallbackDto,
  AssignCallDto,
  CompleteCallDto,
  CreateCallFollowUpDto,
  StartCallDto,
} from './dto/call-centre.dto';

@Injectable()
export class CallCentreService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: CallProviderService,
  ) {}

  async queue() {
    const loans = await this.prisma.scoped.loan.findMany({
      where: {
        status: LoanStatus.ACTIVE,
        installments: { some: { status: InstallmentStatus.OVERDUE } },
      },
      include: {
        customer: true,
        device: true,
        installments: {
          where: { status: InstallmentStatus.OVERDUE },
          orderBy: { dueDate: 'asc' },
          take: 1,
        },
        callFollowUps: {
          orderBy: { calledAt: 'desc' },
          take: 1,
          include: {
            assignedTo: { select: { id: true, fullName: true } },
            attempts: { orderBy: { startedAt: 'desc' }, take: 1 },
          },
        },
      },
      orderBy: { updatedAt: 'asc' },
    });

    return loans.map((loan) => {
      const installment = loan.installments[0];
      const amountDue = installment
        ? Math.max(Number(installment.amount) - Number(installment.amountPaid), 0)
        : 0;
      return {
        loanId: loan.id,
        customerId: loan.customerId,
        customerName: loan.customer.fullName,
        customerPhone: loan.customer.phone,
        deviceId: loan.deviceId,
        deviceImei: loan.device.imei,
        deviceModel: [loan.device.make, loan.device.model].filter(Boolean).join(' ') || null,
        deviceStatus: loan.device.status,
        currency: loan.currency,
        installmentId: installment?.id ?? null,
        installmentSequence: installment?.sequence ?? null,
        dueDate: installment?.dueDate ?? null,
        amountDue,
        daysOverdue: installment ? daysBetween(installment.dueDate, new Date()) : 0,
        lastFollowUp: loan.callFollowUps[0] ?? null,
      };
    });
  }

  listFollowUps() {
    return this.prisma.scoped.callFollowUp.findMany({
      include: {
        customer: { select: { fullName: true, phone: true } },
        loan: { select: { id: true, currency: true } },
        device: { select: { imei: true, status: true } },
        assignedTo: { select: { id: true, fullName: true } },
        createdBy: { select: { id: true, fullName: true } },
        attempts: { orderBy: { startedAt: 'desc' }, take: 3 },
      },
      orderBy: { calledAt: 'desc' },
      take: 100,
    });
  }

  listAttempts() {
    return this.prisma.scoped.callAttempt.findMany({
      include: {
        customer: { select: { fullName: true, phone: true } },
        staff: { select: { id: true, fullName: true } },
      },
      orderBy: { startedAt: 'desc' },
      take: 100,
    });
  }

  async startCall(dto: StartCallDto, staffId: string) {
    const loan = await this.prisma.scoped.loan.findFirst({
      where: { id: dto.loanId },
      include: { customer: true, device: true },
    });
    if (!loan) throw new NotFoundException('Loan not found');

    const followUp = await this.prisma.scoped.callFollowUp.create({
      data: {
        tenantId: loan.tenantId,
        loanId: loan.id,
        customerId: loan.customerId,
        deviceId: loan.deviceId,
        createdById: staffId,
        assignedToId: staffId,
        outcome: 'CALL_STARTED',
        notes: 'Call initiated from system',
        escalationStatus: 'NONE',
      },
    });

    const attempt = await this.prisma.scoped.callAttempt.create({
      data: {
        tenantId: loan.tenantId,
        followUpId: followUp.id,
        loanId: loan.id,
        customerId: loan.customerId,
        deviceId: loan.deviceId,
        staffId,
        staffPhone: dto.staffPhone,
        customerPhone: loan.customer.phone,
        verificationStatus: 'SELF_REPORTED',
        providerStatus: 'CREATED',
      },
    });

    const provider = await this.provider.startBridgeCall({
      attemptId: attempt.id,
      staffPhone: dto.staffPhone,
      customerPhone: loan.customer.phone,
      customerName: loan.customer.fullName,
    });

    const updated = await this.prisma.scoped.callAttempt.update({
      where: { id: attempt.id },
      data: {
        provider: provider.provider,
        providerCallId: provider.providerCallId,
        providerStatus: provider.status,
        verificationStatus: provider.verificationStatus,
        rawPayload: provider.rawPayload as Prisma.InputJsonValue,
      },
    });

    await this.audit(loan.tenantId, loan.deviceId, 'CALL_ATTEMPT_STARTED', {
      attemptId: updated.id,
      followUpId: followUp.id,
      staffId,
      provider: updated.provider,
      providerStatus: updated.providerStatus,
      verificationStatus: updated.verificationStatus,
    });

    return updated;
  }

  async assign(dto: AssignCallDto, assignedById: string) {
    const loan = await this.prisma.scoped.loan.findFirst({
      where: { id: dto.loanId },
      select: { id: true, tenantId: true, customerId: true, deviceId: true },
    });
    if (!loan) throw new NotFoundException('Loan not found');

    const staff = await this.prisma.scoped.user.findFirst({
      where: { id: dto.assignedToId, isActive: true },
      select: { id: true },
    });
    if (!staff) throw new NotFoundException('Assigned staff not found');

    const followUp = await this.prisma.scoped.callFollowUp.create({
      data: {
        tenantId: loan.tenantId,
        loanId: loan.id,
        customerId: loan.customerId,
        deviceId: loan.deviceId,
        assignedToId: dto.assignedToId,
        createdById: assignedById,
        outcome: 'ASSIGNED',
        notes: dto.notes ?? 'Assigned for customer follow-up',
        escalationStatus: 'NONE',
        nextFollowUpAt: dto.nextFollowUpAt ? new Date(dto.nextFollowUpAt) : undefined,
      },
    });

    await this.audit(loan.tenantId, loan.deviceId, 'CALL_ASSIGNED', {
      followUpId: followUp.id,
      assignedToId: dto.assignedToId,
      assignedById,
      nextFollowUpAt: followUp.nextFollowUpAt?.toISOString(),
    });

    return followUp;
  }


  async completeCall(dto: CompleteCallDto, staffId: string) {
    const attempt = await this.prisma.scoped.callAttempt.findFirst({
      where: { id: dto.attemptId, staffId },
    });
    if (!attempt) throw new NotFoundException('Call attempt not found');
    if (attempt.verificationStatus === 'FAILED') {
      throw new BadRequestException('Failed call attempts cannot be completed as customer follow-up');
    }

    if (!attempt.followUpId) throw new BadRequestException('Call attempt is not linked to a follow-up task');

    const followUp = await this.prisma.scoped.callFollowUp.update({
      where: { id: attempt.followUpId },
      data: {
        outcome: dto.outcome,
        notes: dto.notes,
        promiseToPayAt: dto.promiseToPayAt ? new Date(dto.promiseToPayAt) : null,
        escalationStatus: dto.escalationStatus ?? 'NONE',
        nextFollowUpAt: dto.nextFollowUpAt ? new Date(dto.nextFollowUpAt) : null,
      },
    });

    await this.audit(attempt.tenantId, attempt.deviceId, 'CALL_FOLLOW_UP', {
      followUpId: followUp.id,
      attemptId: attempt.id,
      outcome: followUp.outcome,
      escalationStatus: followUp.escalationStatus,
      verificationStatus: attempt.verificationStatus,
      durationSeconds: attempt.durationSeconds,
      providerCallId: attempt.providerCallId,
      promiseToPayAt: followUp.promiseToPayAt?.toISOString(),
    });

    return followUp;
  }

  async providerCallback(dto: CallProviderCallbackDto, raw: Record<string, any>) {
    const attempt = await this.prisma.callAttempt.findFirst({
      where: dto.attemptId
        ? { id: dto.attemptId }
        : { providerCallId: dto.providerCallId },
    });
    if (!attempt) return { recorded: false, reason: 'unknown_attempt' };

    const status = normalizeStatus(dto.status ?? raw.status ?? raw.callStatus);
    const duration = numberValue(dto.durationSeconds ?? raw.durationSeconds ?? raw.duration);
    const verificationStatus = verificationFromStatus(status, duration);
    const updated = await this.prisma.callAttempt.update({
      where: { id: attempt.id },
      data: {
        providerStatus: status,
        verificationStatus,
        durationSeconds: duration,
        recordingUrl: dto.recordingUrl ?? raw.recordingUrl ?? raw.recording_url,
        endedAt: status === 'IN_PROGRESS' || status === 'RINGING' ? null : new Date(),
        rawPayload: raw as Prisma.InputJsonValue,
      },
    });

    await this.prisma.deviceEvent.create({
      data: {
        tenantId: attempt.tenantId,
        deviceId: attempt.deviceId,
        type: 'CALL_ATTEMPT_VERIFIED',
        metadata: {
          attemptId: attempt.id,
          providerCallId: updated.providerCallId,
          providerStatus: updated.providerStatus,
          verificationStatus: updated.verificationStatus,
          durationSeconds: updated.durationSeconds,
          recordingUrl: updated.recordingUrl,
        },
      },
    });

    return { recorded: true, attemptId: attempt.id, verificationStatus };
  }

  async create(dto: CreateCallFollowUpDto, createdById?: string) {
    const loan = await this.prisma.scoped.loan.findFirst({
      where: { id: dto.loanId },
      select: { id: true, tenantId: true, customerId: true, deviceId: true },
    });
    if (!loan) throw new NotFoundException('Loan not found');

    const followUp = await this.prisma.scoped.callFollowUp.create({
      data: {
        tenantId: loan.tenantId,
        loanId: loan.id,
        customerId: loan.customerId,
        deviceId: loan.deviceId,
        createdById,
        assignedToId: dto.assignedToId,
        outcome: dto.outcome,
        notes: dto.notes,
        promiseToPayAt: dto.promiseToPayAt ? new Date(dto.promiseToPayAt) : undefined,
        escalationStatus: dto.escalationStatus ?? 'NONE',
        nextFollowUpAt: dto.nextFollowUpAt ? new Date(dto.nextFollowUpAt) : undefined,
      },
    });

    await this.prisma.scoped.deviceEvent.create({
      data: {
        tenantId: loan.tenantId,
        deviceId: loan.deviceId,
        type: 'CALL_FOLLOW_UP',
        metadata: {
          followUpId: followUp.id,
          outcome: followUp.outcome,
          escalationStatus: followUp.escalationStatus,
          verificationStatus: 'SELF_REPORTED',
          promiseToPayAt: followUp.promiseToPayAt?.toISOString(),
        } as Prisma.InputJsonObject,
      },
    });

    return followUp;
  }

  async performance() {
    const rows = await this.prisma.scoped.callAttempt.groupBy({
      by: ['staffId', 'verificationStatus'],
      _count: { _all: true },
      _avg: { durationSeconds: true },
      orderBy: { staffId: 'asc' },
    });
    const manualRows = await this.prisma.scoped.callFollowUp.groupBy({
      by: ['createdById', 'outcome'],
      _count: { _all: true },
      orderBy: { createdById: 'asc' },
    });
    return [
      ...rows.map((row) => ({
        staffId: row.staffId,
        outcome: row.verificationStatus,
        count: row._count._all,
        avgDurationSeconds: Math.round(row._avg.durationSeconds ?? 0),
      })),
      ...manualRows.map((row) => ({
      staffId: row.createdById,
      outcome: row.outcome,
      count: row._count._all,
      avgDurationSeconds: 0,
    })),
    ];
  }

  private async audit(tenantId: string, deviceId: string, type: string, metadata: Prisma.InputJsonObject) {
    await this.prisma.scoped.deviceEvent.create({
      data: { tenantId, deviceId, type, metadata },
    });
  }
}

function normalizeStatus(value: unknown) {
  return String(value ?? 'UNKNOWN').trim().toUpperCase() || 'UNKNOWN';
}

function numberValue(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(Math.round(n), 0) : undefined;
}

function verificationFromStatus(status: string, duration?: number) {
  if (['ANSWERED', 'COMPLETED', 'CONNECTED'].includes(status) && (duration ?? 0) > 0) {
    return 'VERIFIED_CONNECTED';
  }
  if (['STAFF_NO_ANSWER', 'MISSED_BY_STAFF'].includes(status)) return 'MISSED_BY_STAFF';
  if (status === 'FAILED') return 'FAILED';
  if (['NO_ANSWER', 'BUSY', 'CANCELLED', 'REJECTED'].includes(status)) {
    return 'VERIFIED_ATTEMPTED';
  }
  return 'ATTEMPTED';
}

function daysBetween(from: Date, to: Date) {
  const dayMs = 24 * 60 * 60 * 1000;
  const a = new Date(from); a.setHours(0, 0, 0, 0);
  const b = new Date(to); b.setHours(0, 0, 0, 0);
  return Math.max(Math.floor((b.getTime() - a.getTime()) / dayMs), 0);
}
