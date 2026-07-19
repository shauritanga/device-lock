import { Module } from '@nestjs/common';
import { CallCentreController } from './call-centre.controller';
import { CallCentreService } from './call-centre.service';
import { CallProviderService } from './call-provider.service';

@Module({
  controllers: [CallCentreController],
  providers: [CallCentreService, CallProviderService],
  exports: [CallCentreService],
})
export class CallCentreModule {}
