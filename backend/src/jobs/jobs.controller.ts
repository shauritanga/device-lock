import { Controller, HttpCode, Post } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { InstallmentsEvaluator } from './installments.evaluator';

/** Manual triggers for scheduled jobs (ops + testing). SUPER_ADMIN only. */
@Controller('jobs')
@Roles(UserRole.SUPER_ADMIN)
export class JobsController {
  constructor(private readonly evaluator: InstallmentsEvaluator) {}

  @Post('run-overdue')
  @HttpCode(200)
  runOverdue() {
    return this.evaluator.evaluateAllTenants();
  }
}
