import { Module } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { CustomersController } from './customers.controller';
import { PhoneVerificationController } from './phone-verification.controller';

@Module({
  providers: [CustomersService],
  controllers: [CustomersController, PhoneVerificationController],
})
export class CustomersModule {}
