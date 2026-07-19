import { Module, forwardRef } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { CommandsModule } from '../commands/commands.module';
import { CollectionsModule } from '../collections/collections.module';

@Module({
  imports: [CommandsModule, forwardRef(() => CollectionsModule)],
  providers: [PaymentsService],
  controllers: [PaymentsController],
  exports: [PaymentsService],
})
export class PaymentsModule {}
