import { Module } from '@nestjs/common';
import { InstallmentsEvaluator } from './installments.evaluator';
import { JobsController } from './jobs.controller';
import { CommandsModule } from '../commands/commands.module';

@Module({
  imports: [CommandsModule],
  providers: [InstallmentsEvaluator],
  controllers: [JobsController],
  exports: [InstallmentsEvaluator],
})
export class JobsModule {}
