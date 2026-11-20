import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../common/prisma/prisma.service';

/** What a seller's own staff may read about their company's policy. Platform staff change it. */
@Controller('tenant-settings')
export class TenantSettingsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async mine(@CurrentUser() actor: AuthUser) {
    if (!actor.tenantId) return { afterRepayment: 'RELEASE', retentionDays: 90 };
    const t = await this.prisma.tenant.findUnique({
      where: { id: actor.tenantId },
      select: { afterRepayment: true, retentionDays: true },
    });
    return t ?? { afterRepayment: 'RELEASE', retentionDays: 90 };
  }
}
