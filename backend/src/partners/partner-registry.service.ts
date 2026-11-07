import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DeviceStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { DevicesService } from '../devices/devices.service';
import {
  PartnerCustomerDto,
  PartnerDeviceDto,
  PartnerRegistrationDto,
} from './dto/partner.dto';

type Result<T> = { data: T; created: boolean };

const CUSTOMER_SELECT = {
  id: true,
  externalId: true,
  fullName: true,
  phone: true,
  nationalId: true,
  idDocumentType: true,
  address: true,
  createdAt: true,
} satisfies Prisma.CustomerSelect;

const DEVICE_SELECT = {
  id: true,
  externalId: true,
  imei: true,
  serialNumber: true,
  make: true,
  model: true,
  status: true,
  customerId: true,
  createdAt: true,
} satisfies Prisma.DeviceSelect;

/**
 * Lets a partner's system create customers and phones here as it creates them there,
 * so nobody registers anything twice. Every call is idempotent: the partner's own id
 * (`externalId`) — or the phone number / IMEI — finds the existing record instead of
 * making a second one. Runs in the tenant bound by ApiKeyGuard.
 */
@Injectable()
export class PartnerRegistryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly devices: DevicesService,
  ) {}

  /** Create the customer, or update it when it already exists (same externalId or phone). */
  async upsertCustomer(dto: PartnerCustomerDto): Promise<Result<unknown>> {
    const tenantId = this.prisma.currentTenantId;
    const byExternal = dto.externalId
      ? await this.prisma.scoped.customer.findFirst({ where: { externalId: dto.externalId } })
      : null;
    const byPhone = await this.prisma.scoped.customer.findFirst({ where: { phone: dto.phone } });

    if (byExternal && byPhone && byExternal.id !== byPhone.id) {
      throw new ConflictException(
        'That phone number already belongs to a different customer in this company',
      );
    }
    const existing = byExternal ?? byPhone;
    if (existing) {
      if (dto.externalId && existing.externalId && existing.externalId !== dto.externalId) {
        throw new ConflictException(
          'A customer with this phone number already exists under a different externalId',
        );
      }
      const updated = await this.prisma.scoped.customer.update({
        where: { id: existing.id },
        data: {
          fullName: dto.fullName,
          phone: dto.phone,
          ...(dto.nationalId !== undefined ? { nationalId: dto.nationalId } : {}),
          ...(dto.idDocumentType !== undefined ? { idDocumentType: dto.idDocumentType } : {}),
          ...(dto.address !== undefined ? { address: dto.address } : {}),
          ...(dto.externalId && !existing.externalId ? { externalId: dto.externalId } : {}),
        },
        select: CUSTOMER_SELECT,
      });
      return { data: updated, created: false };
    }

    const created = await this.prisma.scoped.customer.create({
      data: {
        tenantId,
        externalId: dto.externalId,
        fullName: dto.fullName,
        phone: dto.phone,
        nationalId: dto.nationalId,
        idDocumentType: dto.idDocumentType,
        address: dto.address,
      },
      select: CUSTOMER_SELECT,
    });
    return { data: created, created: true };
  }

  /**
   * Register the phone (or return it when the IMEI / externalId is already known).
   * A phone still waiting to be enrolled comes back with a usable enrollment QR payload.
   */
  async registerDevice(dto: PartnerDeviceDto): Promise<Result<unknown>> {
    const customerId = await this.resolveCustomer(dto);

    const byImei = await this.prisma.scoped.device.findFirst({ where: { imei: dto.imei } });
    const byExternal = dto.externalId
      ? await this.prisma.scoped.device.findFirst({ where: { externalId: dto.externalId } })
      : null;
    if (byImei && byExternal && byImei.id !== byExternal.id) {
      throw new ConflictException('This IMEI and externalId belong to two different devices');
    }
    const existing = byImei ?? byExternal;
    if (existing) {
      if (existing.imei !== dto.imei) {
        throw new ConflictException('This externalId is already used by a device with another IMEI');
      }
      if (existing.customerId && customerId && existing.customerId !== customerId) {
        throw new ConflictException('This device is already registered to a different customer');
      }
      const updated = await this.prisma.scoped.device.update({
        where: { id: existing.id },
        data: {
          ...(customerId && !existing.customerId ? { customerId } : {}),
          ...(dto.externalId && !existing.externalId ? { externalId: dto.externalId } : {}),
          ...(dto.make !== undefined ? { make: dto.make } : {}),
          ...(dto.model !== undefined ? { model: dto.model } : {}),
          ...(dto.serialNumber !== undefined ? { serialNumber: dto.serialNumber } : {}),
        },
        select: DEVICE_SELECT,
      });
      return { data: await this.withEnrollment(updated), created: false };
    }

    // Reuses the normal registration: agreement check, plan/phone allowance, enrollment token.
    const { device } = await this.devices.register({
      imei: dto.imei,
      serialNumber: dto.serialNumber,
      make: dto.make,
      model: dto.model,
      customerId,
    });
    const saved = dto.externalId
      ? await this.prisma.scoped.device.update({
          where: { id: device.id },
          data: { externalId: dto.externalId },
          select: DEVICE_SELECT,
        })
      : await this.prisma.scoped.device.findFirstOrThrow({
          where: { id: device.id },
          select: DEVICE_SELECT,
        });
    return { data: await this.withEnrollment(saved), created: true };
  }

  /** Customer and phone in one call. */
  async register(dto: PartnerRegistrationDto) {
    const customer = await this.upsertCustomer(dto.customer);
    const device = await this.registerDevice({
      ...dto.device,
      customerId: (customer.data as { id: string }).id,
    });
    return {
      customer: customer.data,
      device: device.data,
      created: { customer: customer.created, device: device.created },
    };
  }

  /** Re-issue the enrollment payload for a phone that has not enrolled yet. */
  async enrollment(deviceId: string) {
    const device = await this.prisma.scoped.device.findFirst({
      where: { id: deviceId },
      select: DEVICE_SELECT,
    });
    if (!device) throw new NotFoundException('Device not found');
    return this.withEnrollment(device, true);
  }

  // ---- helpers ------------------------------------------------------------

  private async resolveCustomer(dto: PartnerDeviceDto): Promise<string | undefined> {
    if (dto.customerId) {
      const c = await this.prisma.scoped.customer.findFirst({
        where: { id: dto.customerId },
        select: { id: true },
      });
      if (!c) throw new NotFoundException('Customer not found');
      return c.id;
    }
    if (dto.externalCustomerId) {
      const c = await this.prisma.scoped.customer.findFirst({
        where: { externalId: dto.externalCustomerId },
        select: { id: true },
      });
      if (!c) {
        throw new NotFoundException(
          'No customer with that externalCustomerId — create the customer first, or use /partner/registrations',
        );
      }
      return c.id;
    }
    return undefined;
  }

  private async withEnrollment<T extends { id: string; status: DeviceStatus }>(
    device: T,
    strict = false,
  ) {
    if (device.status !== DeviceStatus.PENDING_ENROLLMENT) {
      if (strict) {
        throw new ConflictException('This device has already enrolled; there is nothing to scan');
      }
      return { ...device, enrollment: null };
    }
    let payload;
    try {
      payload = await this.devices.enrollmentPayload(device.id);
    } catch {
      await this.devices.regenerateEnrollment(device.id);
      payload = await this.devices.enrollmentPayload(device.id);
    }
    // An expired or already-used token cannot enrol a phone: issue a fresh one.
    if (payload.consumedAt || new Date(payload.expiresAt) < new Date()) {
      await this.devices.regenerateEnrollment(device.id);
      payload = await this.devices.enrollmentPayload(device.id);
    }
    return {
      ...device,
      enrollment: {
        token: payload.enrollmentToken,
        expiresAt: payload.expiresAt,
        qr: payload.qr,
      },
    };
  }
}
