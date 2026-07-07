import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { LoansService } from './loans.service';
import { CreateLoanDto } from './dto/loan.dto';

@Controller('loans')
export class LoansController {
  constructor(private readonly loans: LoansService) {}

  @Post()
  create(@Body() dto: CreateLoanDto) {
    return this.loans.create(dto);
  }

  @Get()
  findAll() {
    return this.loans.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.loans.findOne(id);
  }

  @Get(':id/installments')
  installments(@Param('id') id: string) {
    return this.loans.installments(id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @Roles(UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.MANAGER)
  cancel(@Param('id') id: string) {
    return this.loans.cancel(id);
  }
}
