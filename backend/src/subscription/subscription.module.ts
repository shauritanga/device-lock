import { Global, Module } from '@nestjs/common';
import { SubscriptionAccessService } from './subscription-access.service';
import { SubscriptionController } from './subscription.controller';

@Global()
@Module({
  controllers: [SubscriptionController],
  providers: [SubscriptionAccessService],
  exports: [SubscriptionAccessService],
})
export class SubscriptionModule {}
