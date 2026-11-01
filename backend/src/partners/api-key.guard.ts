import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createParamDecorator } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import type { Request, Response } from 'express';
import { sha256 } from '../common/crypto.util';
import { PrismaService } from '../common/prisma/prisma.service';
import { TENANT_ID_KEY } from '../common/tenant/tenant-context';

export interface PartnerIdentity {
  apiClientId: string;
  name: string;
  tenantId: string;
}

/** Injects the partner identity attached by ApiKeyGuard. */
export const CurrentPartner = createParamDecorator(
  (_d: unknown, ctx: ExecutionContext): PartnerIdentity =>
    ctx.switchToHttp().getRequest().partner as PartnerIdentity,
);

const WINDOW_MS = 60_000;
const TOUCH_EVERY_MS = 60_000;

/**
 * Authenticates a third-party system by its API key (`Authorization: Bearer dlk_...`).
 *
 * The key resolves to an ApiClient; the company it acts on comes from `X-Tenant-Id`
 * and must be one the client was granted (optional when it has exactly one grant).
 * The tenant is then set into CLS, so every query downstream is tenant-scoped exactly
 * like a dashboard user's request. Also enforces the client's per-minute rate limit.
 *
 * The limiter is in-process (fixed window): correct for a single backend instance;
 * move the counters to Redis before running several instances.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly windows = new Map<string, { start: number; count: number }>();
  private readonly lastTouched = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();

    const header = req.headers.authorization;
    const key = header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined;
    if (!key) throw new UnauthorizedException('Missing API key');

    const client = await this.prisma.apiClient.findUnique({
      where: { keyHash: sha256(key) },
      include: { grants: { select: { tenantId: true, tenant: { select: { isActive: true } } } } },
    });
    if (!client || client.status !== 'ACTIVE') {
      throw new UnauthorizedException('Invalid or inactive API key');
    }

    this.logRequest(client.id, req, res);
    this.rateLimit(client.id, client.rateLimitPerMin, res);

    if (client.readOnly && req.method !== 'GET') {
      throw new ForbiddenException('This API key is read-only');
    }

    const requested = req.headers['x-tenant-id'];
    const granted = client.grants.map((g) => g.tenantId);
    let tenantId: string | undefined;
    if (typeof requested === 'string' && requested) {
      if (!granted.includes(requested)) {
        throw new ForbiddenException('This API key is not authorized for that company');
      }
      tenantId = requested;
    } else if (granted.length === 1) {
      tenantId = granted[0];
    } else if (granted.length === 0) {
      throw new ForbiddenException('This API key has not been granted access to any company');
    } else {
      throw new ForbiddenException('X-Tenant-Id header is required for this API key');
    }

    if (client.grants.find((g) => g.tenantId === tenantId)?.tenant.isActive === false) {
      throw new ForbiddenException('This company is inactive');
    }

    (req as any).partner = {
      apiClientId: client.id,
      name: client.name,
      tenantId,
    } satisfies PartnerIdentity;
    this.cls.set(TENANT_ID_KEY, tenantId);
    this.touch(client.id);
    return true;
  }

  /** Log every authenticated call (including refused ones) once the response is sent. */
  private logRequest(apiClientId: string, req: Request, res: Response) {
    const started = Date.now();
    res.on('finish', () => {
      const tenantId = (req as any).partner?.tenantId ?? null;
      void this.prisma.apiRequestLog
        .create({
          data: {
            apiClientId,
            tenantId,
            method: req.method,
            // Template-ish path without the query string (it can carry an IMEI).
            path: req.originalUrl.split('?')[0]!.replace(/^\/v1/, ''),
            status: res.statusCode,
            durationMs: Date.now() - started,
          },
        })
        .catch(() => undefined);
    });
  }

  private rateLimit(id: string, limit: number, res: Response) {
    const now = Date.now();
    let w = this.windows.get(id);
    if (!w || now - w.start >= WINDOW_MS) {
      w = { start: now, count: 0 };
      this.windows.set(id, w);
    }
    w.count += 1;
    const remaining = Math.max(0, limit - w.count);
    res.setHeader('X-RateLimit-Limit', String(limit));
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    if (w.count > limit) {
      const retryAfter = Math.ceil((w.start + WINDOW_MS - now) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      throw new HttpException('Rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  /** Record last use at most once a minute per client — not a write per request. */
  private touch(id: string) {
    const now = Date.now();
    if (now - (this.lastTouched.get(id) ?? 0) < TOUCH_EVERY_MS) return;
    this.lastTouched.set(id, now);
    void this.prisma.apiClient
      .update({ where: { id }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);
  }
}
