import { Module } from '@nestjs/common';
import { CommandsService } from './commands.service';
import { CollectionsModule } from '../collections/collections.module';

@Module({
  imports: [CollectionsModule],
  providers: [CommandsService],
  exports: [CommandsService],
})
export class CommandsModule {}
