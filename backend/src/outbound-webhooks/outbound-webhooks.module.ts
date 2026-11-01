import { Module } from '@nestjs/common';
import { OutboundWebhooksService } from './outbound-webhooks.service';

@Module({
  providers: [OutboundWebhooksService],
  exports: [OutboundWebhooksService],
})
export class OutboundWebhooksModule {}
