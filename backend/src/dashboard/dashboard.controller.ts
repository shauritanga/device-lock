import { Controller, Get } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/auth.types';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  /** Seller console home — scoped to the caller's tenant. */
  @Get('summary')
  @Roles(
    UserRole.OWNER,
    UserRole.MANAGER,
    UserRole.AGENT,
    UserRole.SUPER_ADMIN,
  )
  summary() {
    return this.dashboard.summary();
  }

  /** Admin console home — platform / call-centre KPIs. */
  @Get('platform')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.COLLECTIONS_ADMIN,
    UserRole.MASTER_COLLECTOR,
    UserRole.COLLECTOR,
  )
  platform(@CurrentUser() actor: AuthUser) {
    return this.dashboard.platformSummary(actor);
  }
}
