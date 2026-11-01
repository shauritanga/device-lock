import { Module } from '@nestjs/common';
import { CommandsModule } from '../commands/commands.module';
import { OutboundWebhooksModule } from '../outbound-webhooks/outbound-webhooks.module';
import { ApiKeyGuard } from './api-key.guard';
import { DevelopersController } from './developers.controller';
import { PartnerApiController } from './partner-api.controller';
import { PartnersController } from './partners.controller';
import { PartnersService } from './partners.service';

@Module({
  imports: [CommandsModule, OutboundWebhooksModule],
  controllers: [PartnersController, PartnerApiController, DevelopersController],
  providers: [PartnersService, ApiKeyGuard],
})
export class PartnersModule {}
