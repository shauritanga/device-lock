import { Global, Module } from '@nestjs/common';
import { PushService } from './push.service';
import { SmsService } from './sms.service';

@Global()
@Module({
  providers: [PushService, SmsService],
  exports: [PushService, SmsService],
})
export class NotificationsModule {}
