import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Ip,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AgreementsService } from './agreements.service';
import {
  CreateAgreementDto,
  SignAgreementDto,
  UpdateAgreementDto,
  VoidAgreementDto,
} from './dto/agreement.dto';

const ADMINS = [UserRole.SUPER_ADMIN, UserRole.COLLECTIONS_ADMIN];

@Controller('agreements')
export class AgreementsController {
  constructor(private readonly agreements: AgreementsService) {}

  // ---- client company (declared first so `me` isn't read as an :id) ------

  @Get('me')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  async mine(@CurrentUser() user: AuthUser) {
    return (await this.agreements.currentForTenant(this.tenantOf(user))) ?? null;
  }

  @Post('me/:id/sign')
  @Roles(UserRole.OWNER)
  sign(
    @Param('id') id: string,
    @Body() dto: SignAgreementDto,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.agreements.signForTenant(this.tenantOf(user), id, dto, user, {
      ip,
      userAgent,
    });
  }

  // ---- platform admin ----------------------------------------------------

  @Get()
  @Roles(...ADMINS)
  list(@Query('tenantId') tenantId?: string) {
    if (!tenantId) throw new BadRequestException('tenantId is required');
    return this.agreements.listForTenant(tenantId);
  }

  @Post()
  @Roles(...ADMINS)
  create(@Body() dto: CreateAgreementDto, @CurrentUser() user: AuthUser) {
    return this.agreements.create(dto, user);
  }

  @Get(':id')
  @Roles(...ADMINS)
  findOne(@Param('id') id: string) {
    return this.agreements.findOne(id);
  }

  @Patch(':id')
  @Roles(...ADMINS)
  update(@Param('id') id: string, @Body() dto: UpdateAgreementDto) {
    return this.agreements.update(id, dto);
  }

  @Post(':id/send')
  @Roles(...ADMINS)
  send(@Param('id') id: string) {
    return this.agreements.send(id);
  }

  @Post(':id/countersign')
  @Roles(...ADMINS)
  countersign(
    @Param('id') id: string,
    @Body() dto: SignAgreementDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.agreements.countersign(id, dto, user);
  }

  @Post(':id/void')
  @Roles(...ADMINS)
  voidIt(@Param('id') id: string, @Body() dto: VoidAgreementDto) {
    return this.agreements.voidAgreement(id, dto.reason);
  }

  private tenantOf(user: AuthUser): string {
    if (!user.tenantId) throw new BadRequestException('No company on this account');
    return user.tenantId;
  }
}
