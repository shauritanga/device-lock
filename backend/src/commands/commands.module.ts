import { Module } from '@nestjs/common';
import { CommandsService } from './commands.service';
import { CollectionsModule } from '../collections/collections.module';
import { OutboundWebhooksModule } from '../outbound-webhooks/outbound-webhooks.module';

@Module({
  imports: [CollectionsModule, OutboundWebhooksModule],
  providers: [CommandsService],
  exports: [CommandsService],
})
export class CommandsModule {}
