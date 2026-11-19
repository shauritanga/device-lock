import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/auth.types';
import { Roles } from '../common/decorators/roles.decorator';
import { LoansService } from './loans.service';
import { CreateLoanDto } from './dto/loan.dto';

@Controller('loans')
export class LoansController {
  constructor(private readonly loans: LoansService) {}

  @Post()
  create(@Body() dto: CreateLoanDto, @CurrentUser() actor: AuthUser) {
    return this.loans.create(dto, actor);
  }

  @Get()
  findAll(@CurrentUser() actor: AuthUser) {
    return this.loans.findAll(actor);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    return this.loans.findOne(id, actor);
  }

  @Get(':id/installments')
  installments(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    return this.loans.installments(id, actor);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @Roles(UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.MANAGER)
  cancel(@Param('id') id: string) {
    return this.loans.cancel(id);
  }
}
