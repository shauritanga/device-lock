import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ClsService } from 'nestjs-cls';
import {
  TENANT_ID_KEY,
  TENANT_SCOPED_MODELS,
} from '../tenant/tenant-context';

/**
 * Build a PrismaClient extended with automatic tenant scoping.
 *
 * The extension reads the current `tenantId` from the request's CLS context and:
 *   - injects `where: { tenantId }` into every read/update/delete, and
 *   - sets `tenantId` on every create,
 * for the models in TENANT_SCOPED_MODELS.
 *
 * This is the app-layer half of tenant isolation; Postgres RLS is the DB-layer
 * half (see prisma/migrations/*_rls). A SUPER_ADMIN request leaves tenantId
 * unset, so platform-wide queries are still possible from the admin module.
 */
export function extendWithTenantScope(base: PrismaClient, cls: ClsService) {
  return base.$extends({
    name: 'tenant-scope',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          // Returns undefined outside a request / for super-admin context.
          const tenantId = cls.get<string | undefined>(TENANT_ID_KEY);

          if (!tenantId || !TENANT_SCOPED_MODELS.has(model)) {
            return query(args);
          }

          const a: any = args ?? {};

          switch (operation) {
            case 'findFirst':
            case 'findFirstOrThrow':
            case 'findMany':
            case 'findUnique':
            case 'findUniqueOrThrow':
            case 'count':
            case 'aggregate':
            case 'groupBy':
            case 'updateMany':
            case 'deleteMany':
            case 'update':
            case 'delete':
              a.where = { ...(a.where ?? {}), tenantId };
              break;
            case 'create':
              a.data = { ...(a.data ?? {}), tenantId };
              break;
            case 'createMany': {
              const data = a.data;
              a.data = Array.isArray(data)
                ? data.map((d: any) => ({ ...d, tenantId }))
                : { ...data, tenantId };
              break;
            }
            case 'upsert':
              a.where = { ...(a.where ?? {}), tenantId };
              a.create = { ...(a.create ?? {}), tenantId };
              break;
            default:
              break;
          }

          return query(a);
        },
      },
    },
  });
}

export type ExtendedPrisma = ReturnType<typeof extendWithTenantScope>;

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  /** The tenant-scoped client that services should use. */
  readonly scoped: ExtendedPrisma;

  constructor(private readonly cls: ClsService) {
    super();
    this.scoped = extendWithTenantScope(this, this.cls);
  }

  /**
   * Current request's tenant id from CLS. Use when constructing `create` inputs
   * (Prisma's types require tenantId explicitly even though the extension would
   * also inject it). Throws if called outside a tenant-bound request.
   */
  get currentTenantId(): string {
    const id = this.cls.get<string | undefined>(TENANT_ID_KEY);
    if (!id) {
      throw new Error('No tenant in context for a tenant-scoped write');
    }
    return id;
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Prisma connected');
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
