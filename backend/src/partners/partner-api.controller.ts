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
import { PartnerLockDto } from './dto/partner.dto';
import { PartnersService } from './partners.service';

/**
 * Public machine-to-machine API (`/v1/partner/*`). Authenticated by API key, not by a
 * user JWT, so it is @Public to the global guards and protected by ApiKeyGuard instead.
 */
@Public()
@UseGuards(ApiKeyGuard)
@Controller('partner')
export class PartnerApiController {
  constructor(private readonly partners: PartnersService) {}

  @Get('devices/lookup')
  lookup(@Query('imei') imei?: string) {
    if (!imei || !/^\d{14,17}$/.test(imei)) {
      throw new BadRequestException('imei must be 14-17 digits');
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
