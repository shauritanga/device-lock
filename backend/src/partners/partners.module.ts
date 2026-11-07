import { Module } from '@nestjs/common';
import { CommandsModule } from '../commands/commands.module';
import { DevicesModule } from '../devices/devices.module';
import { OutboundWebhooksModule } from '../outbound-webhooks/outbound-webhooks.module';
import { ApiKeyGuard } from './api-key.guard';
import { DevelopersController } from './developers.controller';
import { PartnerApiController } from './partner-api.controller';
import { PartnersController } from './partners.controller';
import { PartnerRegistryService } from './partner-registry.service';
import { PartnersService } from './partners.service';

@Module({
  imports: [CommandsModule, DevicesModule, OutboundWebhooksModule],
  controllers: [PartnersController, PartnerApiController, DevelopersController],
  providers: [PartnersService, PartnerRegistryService, ApiKeyGuard],
})
export class PartnersModule {}
