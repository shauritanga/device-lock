import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import {
  CreatePartnerDto,
  GrantTenantDto,
  UpdatePartnerDto,
} from './dto/partner.dto';
import { PartnersService } from './partners.service';

/** Platform-admin management of API partners. Keys and secrets are only returned on create/rotate. */
@Controller('partners')
@Roles(UserRole.SUPER_ADMIN)
export class PartnersController {
  constructor(private readonly partners: PartnersService) {}

  @Post()
  create(@Body() dto: CreatePartnerDto, @CurrentUser() user: AuthUser) {
    return this.partners.create(dto, user);
  }

  @Get()
  list() {
    return this.partners.list();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.partners.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePartnerDto) {
    return this.partners.update(id, dto);
  }

  @Post(':id/revoke')
  revoke(@Param('id') id: string) {
    return this.partners.revoke(id);
  }

  @Post(':id/rotate-key')
  rotateKey(@Param('id') id: string) {
    return this.partners.rotateKey(id);
  }

  @Post(':id/rotate-webhook-secret')
  rotateWebhookSecret(@Param('id') id: string) {
    return this.partners.rotateWebhookSecret(id);
  }

  @Post(':id/grants')
  grant(@Param('id') id: string, @Body() dto: GrantTenantDto) {
    return this.partners.grant(id, dto.tenantId);
  }

  @Delete(':id/grants/:tenantId')
  ungrant(@Param('id') id: string, @Param('tenantId') tenantId: string) {
    return this.partners.ungrant(id, tenantId);
  }

  @Post(':id/test-webhook')
  testWebhook(@Param('id') id: string) {
    return this.partners.sendTestWebhook(id);
  }
}
