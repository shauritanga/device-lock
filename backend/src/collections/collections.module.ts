import { Module, forwardRef } from '@nestjs/common';
import { CollectionsController } from './collections.controller';
import { CollectionsService } from './collections.service';
import { CallCentreModule } from '../call-centre/call-centre.module';

@Module({
  imports: [CallCentreModule],
  controllers: [CollectionsController],
  providers: [CollectionsService],
  exports: [CollectionsService],
})
export class CollectionsModule {}
