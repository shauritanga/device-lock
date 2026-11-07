import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { ApiKeyGuard, CurrentPartner, PartnerIdentity } from './api-key.guard';
import {
  PartnerCustomerDto,
  PartnerDeviceDto,
  PartnerLockDto,
  PartnerRegistrationDto,
} from './dto/partner.dto';
import { PartnerRegistryService } from './partner-registry.service';
import { PartnersService } from './partners.service';

/**
 * Public machine-to-machine API (`/v1/partner/*`). Authenticated by API key, not by a
 * user JWT, so it is @Public to the global guards and protected by ApiKeyGuard instead.
 */
@Public()
@UseGuards(ApiKeyGuard)
@Controller('partner')
export class PartnerApiController {
  constructor(
    private readonly partners: PartnersService,
    private readonly registry: PartnerRegistryService,
  ) {}

  /**
   * Sync a sale from the partner's system in one call: creates the customer and the phone
   * here (or finds them when they already exist). Safe to retry.
   */
  @Post('registrations')
  async register(
    @Body() dto: PartnerRegistrationDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const r = await this.registry.register(dto);
    res.status(r.created.customer || r.created.device ? 201 : 200);
    return r;
  }

  /** Create or update a customer (matched by externalId, then phone number). */
  @Post('customers')
  async customer(
    @Body() dto: PartnerCustomerDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const r = await this.registry.upsertCustomer(dto);
    res.status(r.created ? 201 : 200);
    return r.data;
  }

  /** Register a phone (matched by IMEI, then externalId). */
  @Post('devices')
  async registerDevice(
    @Body() dto: PartnerDeviceDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const r = await this.registry.registerDevice(dto);
    res.status(r.created ? 201 : 200);
    return r.data;
  }

  /** The QR payload for a phone that has not enrolled yet (re-issued if it expired). */
  @Get('devices/:id/enrollment')
  enrollment(@Param('id', ParseUUIDPipe) id: string) {
    return this.registry.enrollment(id);
  }

  @Get('devices/lookup')
  lookup(@Query('imei') imei?: string, @Query('externalId') externalId?: string) {
    if (externalId) return this.partners.lookupByExternalId(externalId);
    if (!imei || !/^\d{14,17}$/.test(imei)) {
      throw new BadRequestException('imei must be 14-17 digits (or pass externalId)');
    }
    return this.partners.lookupByImei(imei);
  }

  @Get('devices/:id')
  device(@Param('id', ParseUUIDPipe) id: string) {
    return this.partners.getDevice(id);
  }

  @Post('devices/:id/lock')
  @HttpCode(202)
  async lock(
    @CurrentPartner() partner: PartnerIdentity,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PartnerLockDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.respond(res, await this.partners.changeLock(partner, id, 'LOCK', dto));
  }

  @Post('devices/:id/unlock')
  @HttpCode(202)
  async unlock(
    @CurrentPartner() partner: PartnerIdentity,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PartnerLockDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.respond(res, await this.partners.changeLock(partner, id, 'UNLOCK', dto));
  }

  @Get('commands/:id')
  command(
    @CurrentPartner() partner: PartnerIdentity,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.partners.getCommand(partner, id);
  }

  /** 202 for a new command, 200 when an idempotent retry returns the original. */
  private respond(
    res: Response,
    r: { command: unknown; replay: boolean },
  ) {
    if (r.replay) res.status(200);
    return { ...(r.command as object), idempotentReplay: r.replay };
  }
}
