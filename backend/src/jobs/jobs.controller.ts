import { Controller, HttpCode, Post } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { InstallmentsEvaluator } from './installments.evaluator';
import { CommandsService } from '../commands/commands.service';
import { DormancyService } from '../commands/dormancy.service';

/** Manual triggers for scheduled jobs (ops + testing). SUPER_ADMIN only. */
@Controller('jobs')
@Roles(UserRole.SUPER_ADMIN)
export class JobsController {
  constructor(
    private readonly evaluator: InstallmentsEvaluator,
    private readonly commands: CommandsService,
    private readonly dormancy: DormancyService,
  ) {}

  @Post('run-overdue')
  @HttpCode(200)
  runOverdue() {
    return this.evaluator.evaluateAllTenants();
  }

  /** Re-send the signed SMS for commands still waiting on silent phones (run after topping up the SMS balance). */
  @Post('retry-sms')
  @HttpCode(200)
  retrySms() {
    return this.commands.retryStuckSms();
  }

  /** Release phones held for repeat lending past their retention period. */
  @Post('release-dormant')
  @HttpCode(200)
  releaseDormant() {
    return this.dormancy.releaseExpired();
  }
}
