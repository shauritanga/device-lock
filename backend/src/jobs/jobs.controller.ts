import { Controller, HttpCode, Post } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { InstallmentsEvaluator } from './installments.evaluator';
import { CommandsService } from '../commands/commands.service';

/** Manual triggers for scheduled jobs (ops + testing). SUPER_ADMIN only. */
@Controller('jobs')
@Roles(UserRole.SUPER_ADMIN)
export class JobsController {
  constructor(
    private readonly evaluator: InstallmentsEvaluator,
    private readonly commands: CommandsService,
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
}
