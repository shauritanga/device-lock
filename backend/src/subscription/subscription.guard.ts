import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';
import type { AuthUser } from '../auth/auth.types';
import { SubscriptionAccessService } from './subscription-access.service';

const READ_ONLY_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Writes that stay open while a company is locked: signing in and signing the agreement. */
const ALWAYS_ALLOWED = ['/v1/auth', '/v1/agreements/me'];

/** Where phones are registered and sold — closed to Negotiation clients. */
const PHONE_ROUTES = ['/v1/devices', '/v1/loans', '/v1/contracts'];

const under = (path: string, prefixes: string[]) =>
  prefixes.some((p) => path === p || path.startsWith(`${p}/`));

/**
 * Makes a company read-only until its package is paid. Only applies to seller
 * staff (they carry a tenantId) and only to writes: reading data, signing in,
 * agent check-ins from already-enrolled phones, and payment webhooks keep
 * working, so locked phones and payments in flight are never disturbed.
 */
@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly access: SubscriptionAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const tenantId = req.user?.tenantId;
    if (!tenantId || READ_ONLY_METHODS.has(req.method)) return true;
    if (under(req.path, ALWAYS_ALLOWED)) return true;

    const state = await this.access.check(tenantId);

    if (state.noPhones && under(req.path, PHONE_ROUTES)) {
      throw new ForbiddenException({
        code: 'NEGOTIATION_NO_PHONES',
        message: "The Negotiation package is for lenders that don't sell phones.",
      });
    }
    if (!state.allowed) {
      throw new ForbiddenException({
        code: 'SUBSCRIPTION_REQUIRED',
        reason: state.reason,
        message: state.message,
      });
    }
    return true;
  }
}
