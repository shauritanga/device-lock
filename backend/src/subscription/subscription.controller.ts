import { Controller, Get } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import type { AuthUser } from '../auth/auth.types';
import { SubscriptionAccessService } from './subscription-access.service';

@Controller('subscription')
export class SubscriptionController {
  constructor(private readonly access: SubscriptionAccessService) {}

  /** Can this company work right now, and if not, why and what unlocks it. */
  @Get('access')
  @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.AGENT)
  mine(@CurrentUser() user: AuthUser) {
    return this.access.check(user.tenantId!);
  }
}
