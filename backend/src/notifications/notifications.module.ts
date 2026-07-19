import { Global, Module } from '@nestjs/common';
import { PushService } from './push.service';
import { SmsService } from './sms.service';
import { VoiceService } from './voice.service';

@Global()
@Module({
  providers: [PushService, SmsService, VoiceService],
  exports: [PushService, SmsService, VoiceService],
})
export class NotificationsModule {}
