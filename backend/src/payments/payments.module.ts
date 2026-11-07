import { Module, forwardRef } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { PayoutsService } from './payouts.service';
import { PayoutsController } from './payouts.controller';
import { SnippeReconciler } from './snippe.reconciler';
import { CommandsModule } from '../commands/commands.module';
import { CollectionsModule } from '../collections/collections.module';

@Module({
  imports: [CommandsModule, forwardRef(() => CollectionsModule)],
  providers: [PaymentsService, PayoutsService, SnippeReconciler],
  controllers: [PaymentsController, PayoutsController],
  exports: [PaymentsService, PayoutsService],
})
export class PaymentsModule {}
