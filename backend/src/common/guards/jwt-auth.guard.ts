import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ClsService } from 'nestjs-cls';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { JwtPayload } from '../../auth/auth.types';
import { TENANT_ID_KEY } from '../tenant/tenant-context';

/**
 * Validates the Bearer access token, attaches `request.user`, and — crucially —
 * writes the caller's `tenantId` into CLS so the Prisma extension scopes every
 * query automatically. SUPER_ADMIN has tenantId=null, so its requests stay
 * unscoped (can operate across tenants).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly cls: ClsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(req);
    if (!token) throw new UnauthorizedException('Missing bearer token');

    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token, {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
    if (payload.type !== 'access') {
      throw new UnauthorizedException('Wrong token type');
    }

    (req as any).user = {
      userId: payload.sub,
      tenantId: payload.tenantId,
      role: payload.role,
    };

    // Drive tenant scoping. Only set for tenant-bound users.
    if (payload.tenantId) {
      this.cls.set(TENANT_ID_KEY, payload.tenantId);
    }

    return true;
  }

  private extractToken(req: Request): string | undefined {
    const header = req.headers.authorization;
    if (!header) return undefined;
    const [scheme, value] = header.split(' ');
    return scheme === 'Bearer' ? value : undefined;
  }
}
