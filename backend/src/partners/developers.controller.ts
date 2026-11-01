import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateApiKeyDto, UpdateApiKeyDto } from './dto/partner.dto';
import { PartnersService } from './partners.service';

/**
 * Developer settings for a company: its own API keys, webhook, and request log. A company
 * owner manages only keys pinned to their company (ownerTenantId), and those keys can only
 * ever act on that company.
 */
@Controller('developers')
@Roles(UserRole.OWNER)
export class DevelopersController {
  constructor(
    private readonly partners: PartnersService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('overview')
  async overview(@CurrentUser() user: AuthUser) {
    const tenantId = this.tenantOf(user);
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true },
    });
    return { company: tenant };
  }

  @Get('keys')
  list(@CurrentUser() user: AuthUser) {
    return this.partners.listOwnedKeys(this.tenantOf(user));
  }

  @Post('keys')
  create(@Body() dto: CreateApiKeyDto, @CurrentUser() user: AuthUser) {
    return this.partners.createOwnedKey(this.tenantOf(user), dto, user);
  }

  @Get('keys/:id')
  one(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.partners.getOwnedKey(this.tenantOf(user), id);
  }

  @Patch('keys/:id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateApiKeyDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.partners.updateOwnedKey(this.tenantOf(user), id, dto);
  }

  @Post('keys/:id/roll')
  roll(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.partners.rollOwnedKey(this.tenantOf(user), id);
  }

  @Post('keys/:id/revoke')
  revoke(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.partners.revokeOwnedKey(this.tenantOf(user), id);
  }

  @Post('keys/:id/webhook-secret/roll')
  rollSecret(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.partners.rollOwnedSecret(this.tenantOf(user), id);
  }

  @Post('keys/:id/test-webhook')
  test(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.partners.testOwnedWebhook(this.tenantOf(user), id);
  }

  @Get('logs')
  logs(
    @CurrentUser() user: AuthUser,
    @Query('keyId') keyId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.partners.ownedLogs(this.tenantOf(user), keyId, Number(limit) || 100);
  }

  private tenantOf(user: AuthUser): string {
    if (!user.tenantId) throw new BadRequestException('No company on this account');
    return user.tenantId;
  }
}
