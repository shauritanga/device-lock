import { Injectable, NotFoundException } from '@nestjs/common';
import { DeviceStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';

const PLANS: Record<string, { base: number; includedDevices: number; device: number; sms: number; voice: number; call: number }> = {
  STARTER: { base: 25000, includedDevices: 20, device: 1500, sms: 50, voice: 120, call: 300 },
  GROWTH: { base: 75000, includedDevices: 75, device: 1200, sms: 40, voice: 100, call: 250 },
  BUSINESS: { base: 180000, includedDevices: 200, device: 900, sms: 30, voice: 80, call: 200 },
};

@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService) {}

  async summary() {
    const tenant = await this.currentTenant();
    const period = currentPeriod();
    const usage = await this.usage(period.start, period.end);
    const estimate = this.calculate(tenant.billingPlan, usage);
    const invoices = await this.prisma.scoped.billingInvoice.findMany({
      orderBy: { periodStart: 'desc' },
      take: 6,
    });
    return { tenant, period, usage, estimate, invoices };
  }

  invoices() {
    return this.prisma.scoped.billingInvoice.findMany({
      orderBy: { periodStart: 'desc' },
      take: 24,
    });
  }

  async generateInvoice(date = new Date()) {
    const tenant = await this.currentTenant();
    const period = monthPeriod(date);
    const usage = await this.usage(period.start, period.end);
    const estimate = this.calculate(tenant.billingPlan, usage);

    return this.prisma.scoped.billingInvoice.upsert({
      where: { tenantId_periodStart: { tenantId: tenant.id, periodStart: period.start } },
      create: {
        tenantId: tenant.id,
        periodStart: period.start,
        periodEnd: period.end,
        planName: tenant.billingPlan,
        activeDevices: usage.activeDevices,
        smsCount: usage.smsCount,
        voiceCount: usage.voiceCount,
        callCentreCount: usage.callCentreCount,
        subtotal: estimate.subtotal,
        total: estimate.total,
        lineItems: estimate.lineItems as Prisma.InputJsonValue,
      },
      update: {
        planName: tenant.billingPlan,
        activeDevices: usage.activeDevices,
        smsCount: usage.smsCount,
        voiceCount: usage.voiceCount,
        callCentreCount: usage.callCentreCount,
        subtotal: estimate.subtotal,
        total: estimate.total,
        lineItems: estimate.lineItems as Prisma.InputJsonValue,
      },
    });
  }

  private async currentTenant() {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: this.prisma.currentTenantId },
      select: { id: true, name: true, billingPlan: true, subscriptionStatus: true },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant;
  }

  private async usage(start: Date, end: Date) {
    const [activeDevices, smsCommands, smsReminders, voiceCallbacks, voiceReminders, callCentreCount] = await Promise.all([
      this.prisma.scoped.device.count({ where: { status: { in: [DeviceStatus.ACTIVE, DeviceStatus.LOCKED] } } }),
      this.prisma.scoped.deviceEvent.count({ where: { type: { in: ['SMS_COMMAND_SENT', 'SMS_COMMAND_STUBBED'] }, createdAt: { gte: start, lt: end } } }),
      this.prisma.scoped.deviceEvent.count({ where: { type: { startsWith: 'REMINDER_' }, createdAt: { gte: start, lt: end } } }),
      this.prisma.scoped.deviceEvent.count({ where: { type: 'VOICE_CALLBACK', createdAt: { gte: start, lt: end } } }),
      this.prisma.scoped.deviceEvent.count({ where: { type: { startsWith: 'REMINDER_' }, createdAt: { gte: start, lt: end } } }),
      this.prisma.scoped.callFollowUp.count({ where: { calledAt: { gte: start, lt: end } } }),
    ]);
    return {
      activeDevices,
      smsCount: smsCommands + smsReminders,
      voiceCount: voiceCallbacks + voiceReminders,
      callCentreCount,
    };
  }

  private calculate(planName: string, usage: { activeDevices: number; smsCount: number; voiceCount: number; callCentreCount: number }) {
    const plan = PLANS[planName] ?? PLANS.STARTER;
    const extraDevices = Math.max(usage.activeDevices - plan.includedDevices, 0);
    const lineItems = [
      { label: `${planName} subscription`, quantity: 1, unitPrice: plan.base, amount: plan.base },
      { label: 'Extra active devices', quantity: extraDevices, unitPrice: plan.device, amount: extraDevices * plan.device },
      { label: 'SMS usage', quantity: usage.smsCount, unitPrice: plan.sms, amount: usage.smsCount * plan.sms },
      { label: 'Voice/IVR usage', quantity: usage.voiceCount, unitPrice: plan.voice, amount: usage.voiceCount * plan.voice },
      { label: 'Call-centre follow-ups', quantity: usage.callCentreCount, unitPrice: plan.call, amount: usage.callCentreCount * plan.call },
    ];
    const subtotal = lineItems.reduce((sum, item) => sum + item.amount, 0);
    return { plan: { name: planName, ...plan }, lineItems, subtotal, tax: 0, total: subtotal };
  }
}

function currentPeriod() {
  return monthPeriod(new Date());
}

function monthPeriod(date: Date) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 1);
  return { start, end };
}
