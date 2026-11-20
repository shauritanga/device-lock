import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { PaymentsService } from './payments.service';
import {
  InitiatePaymentDto,
  MarkInstallmentPaidDto,
  RecordPaymentDto,
} from './dto/payment.dto';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  // Marking money as received (cash, or an installment paid) is for owners and managers only.
  // A sales agent can ask a customer to pay by mobile money, but never confirm a payment.
  @Post()
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  record(@Body() dto: RecordPaymentDto) {
    return this.payments.recordManual(dto);
  }

  @Post('mobile')
  @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.AGENT)
  initiate(@Body() dto: InitiatePaymentDto) {
    return this.payments.initiateMobileMoney(dto);
  }

  @Post('installments/:installmentId/pay')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  payInstallment(
    @Param('installmentId') installmentId: string,
    @Body() dto: MarkInstallmentPaidDto,
  ) {
    return this.payments.recordInstallmentPayment(installmentId, dto);
  }

  /** What is still owed on a loan — the exact amount that pays it off. */
  @Get('loans/:loanId/balance')
  balance(@Param('loanId') loanId: string) {
    return this.payments.loanBalance(loanId);
  }

  @Get()
  list() {
    return this.payments.list();
  }
}
