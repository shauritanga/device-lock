import { Module } from '@nestjs/common';
import { AgentService } from './agent.service';
import { AgentController } from './agent.controller';
import { DeviceAuthGuard } from '../common/guards/device-auth.guard';
import { CommandsModule } from '../commands/commands.module';

@Module({
  imports: [CommandsModule],
  providers: [AgentService, DeviceAuthGuard],
  controllers: [AgentController],
})
export class AgentModule {}
