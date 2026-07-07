import { Body, Controller, Get, Post } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { PaymentsService } from './payments.service';
import { InitiatePaymentDto, RecordPaymentDto } from './dto/payment.dto';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post()
  @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.AGENT)
  record(@Body() dto: RecordPaymentDto) {
    return this.payments.recordManual(dto);
  }

  @Post('mobile')
  @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.AGENT)
  initiate(@Body() dto: InitiatePaymentDto) {
    return this.payments.initiateMobileMoney(dto);
  }

  @Get()
  list() {
    return this.payments.list();
  }
}
