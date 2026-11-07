import { Global, Module } from '@nestjs/common';
import { SnippeService } from './snippe.service';

@Global()
@Module({
  providers: [SnippeService],
  exports: [SnippeService],
})
export class SnippeModule {}
