import { Controller, Get, HttpCode, Post } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { BillingService } from './billing.service';

@Controller('billing')
@Roles(UserRole.OWNER, UserRole.MANAGER)
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get('summary')
  summary() {
    return this.billing.summary();
  }

  @Get('invoices')
  invoices() {
    return this.billing.invoices();
  }

  @Post('invoices/generate')
  @HttpCode(201)
  generate() {
    return this.billing.generateInvoice();
  }
}
