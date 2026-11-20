import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { TENANT_ID_KEY } from '../tenant/tenant-context';
import { sha256 } from '../crypto.util';

export interface VerificationIdentity {
  sessionId: string;
  tenantId: string;
  customerId: string;
  createdById: string;
}

/**
 * Authenticates the phone that scanned a verification QR code. The URL carries a
 * random token (only its hash is stored). A link that is expired, cancelled or
 * already completed answers 404, so a leaked link stops working.
 */
@Injectable()
export class VerificationSessionGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const token = String(req.params.token ?? '');
    if (token.length < 32) throw new NotFoundException('This link is not valid');

    const session = await this.prisma.verificationSession.findUnique({
      where: { tokenHash: sha256(token) },
      select: {
        id: true,
        tenantId: true,
        customerId: true,
        createdById: true,
        expiresAt: true,
        completedAt: true,
        cancelledAt: true,
      },
    });
    if (
      !session ||
      session.completedAt ||
      session.cancelledAt ||
      session.expiresAt.getTime() < Date.now()
    ) {
      throw new NotFoundException('This link has expired. Ask for a new QR code.');
    }

    (req as any).verification = {
      sessionId: session.id,
      tenantId: session.tenantId,
      customerId: session.customerId,
      createdById: session.createdById,
    } satisfies VerificationIdentity;
    this.cls.set(TENANT_ID_KEY, session.tenantId);
    return true;
  }
}
