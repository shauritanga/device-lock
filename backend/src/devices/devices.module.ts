import { Module } from '@nestjs/common';
import { DevicesService } from './devices.service';
import { DevicesController } from './devices.controller';
import { CommandsModule } from '../commands/commands.module';
import { ProvisioningModule } from '../provisioning/provisioning.module';

@Module({
  imports: [CommandsModule, ProvisioningModule],
  providers: [DevicesService],
  controllers: [DevicesController],
})
export class DevicesModule {}
