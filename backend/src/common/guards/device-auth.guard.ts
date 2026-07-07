import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { TENANT_ID_KEY } from '../tenant/tenant-context';
import { sha256 } from '../crypto.util';

export interface DeviceIdentity {
  deviceId: string;
  tenantId: string;
}

/**
 * Authenticates the on-device agent via its per-device bearer token (issued at
 * enrollment, stored hashed in Device.agentTokenHash). On success it sets the
 * device's tenant into CLS so tenant scoping applies to agent requests too.
 */
@Injectable()
export class DeviceAuthGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const header = req.headers.authorization;
    const token =
      header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;
    if (!token) throw new UnauthorizedException('Missing device token');

    // Unscoped lookup (no tenant context yet); agentTokenHash is unique.
    const device = await this.prisma.device.findUnique({
      where: { agentTokenHash: sha256(token) },
      select: { id: true, tenantId: true, status: true },
    });
    if (!device) throw new UnauthorizedException('Invalid device token');

    (req as any).device = {
      deviceId: device.id,
      tenantId: device.tenantId,
    } satisfies DeviceIdentity;

    this.cls.set(TENANT_ID_KEY, device.tenantId);
    return true;
  }
}
