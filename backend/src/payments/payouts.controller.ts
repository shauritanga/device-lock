import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { PayoutsService } from './payouts.service';

@Controller('payouts')
export class PayoutsController {
  constructor(private readonly payouts: PayoutsService) {}

  /** Disbursements to the seller. Tenant staff see their own; super admin sees all. */
  @Get()
  @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.SUPER_ADMIN)
  list(@Query('tenantId') tenantId?: string) {
    return this.payouts.list(tenantId);
  }

  /** Payout destination + owed / in-flight / paid-out totals. */
  @Get('summary')
  @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.SUPER_ADMIN)
  summary(@Query('tenantId') tenantId?: string) {
    return this.payouts.summary(tenantId);
  }

  /** Force a disbursement run for one tenant (e.g. after fixing its payout account). */
  @Post('tenants/:tenantId/disburse')
  @Roles(UserRole.SUPER_ADMIN)
  disburse(@Param('tenantId') tenantId: string) {
    return this.payouts.disburseTenant(tenantId);
  }
}
