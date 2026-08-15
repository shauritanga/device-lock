import { Global, Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { PushService } from './push.service';
import { SmsService } from './sms.service';
import { VoiceService } from './voice.service';

@Global()
@Module({
  providers: [PushService, SmsService, VoiceService, EmailService],
  exports: [PushService, SmsService, VoiceService, EmailService],
})
export class NotificationsModule {}
