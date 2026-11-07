import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import { PayoutsService } from './payouts.service';
import { AdminPayoutAccountDto, OwnerPayoutAccountDto } from './dto/payout-account.dto';

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
    return this.payouts.disburseTenant(tenantId, { manual: true });
  }

  /** Owner sets/changes their own payout account (password re-entry + hold). */
  @Put('account')
  @Roles(UserRole.OWNER)
  changeOwn(@CurrentUser() user: AuthUser, @Body() dto: OwnerPayoutAccountDto) {
    return this.payouts.changeOwnAccount(user, dto);
  }

  /** Super admin sets/fixes any company's payout account. */
  @Put('tenants/:tenantId/account')
  @Roles(UserRole.SUPER_ADMIN)
  changeAsAdmin(
    @CurrentUser() user: AuthUser,
    @Param('tenantId') tenantId: string,
    @Body() dto: AdminPayoutAccountDto,
  ) {
    return this.payouts.changeAccountAsAdmin(user, tenantId, dto);
  }

  /** Audit trail of payout-account changes. */
  @Get('account-history')
  @Roles(UserRole.OWNER, UserRole.SUPER_ADMIN)
  history(@Query('tenantId') tenantId?: string) {
    return this.payouts.history(tenantId);
  }
}
