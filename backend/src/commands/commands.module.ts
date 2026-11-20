import { Module } from '@nestjs/common';
import { CommandsService } from './commands.service';
import { DormancyService } from './dormancy.service';
import { CollectionsModule } from '../collections/collections.module';
import { OutboundWebhooksModule } from '../outbound-webhooks/outbound-webhooks.module';

@Module({
  imports: [CollectionsModule, OutboundWebhooksModule],
  providers: [CommandsService, DormancyService],
  exports: [CommandsService, DormancyService],
})
export class CommandsModule {}
