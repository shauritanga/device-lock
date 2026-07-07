import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CommandType, UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/auth.types';
import { DevicesService } from './devices.service';
import { CommandsService } from '../commands/commands.service';
import {
  CreateDeviceDto,
  ListDevicesQuery,
  LockDeviceDto,
  ReleaseDeviceDto,
  UpdateDeviceDto,
} from './dto/device.dto';

@Controller('devices')
export class DevicesController {
  constructor(
    private readonly devices: DevicesService,
    private readonly commands: CommandsService,
  ) {}

  @Post()
  register(@Body() dto: CreateDeviceDto) {
    return this.devices.register(dto);
  }

  @Get()
  findAll(@Query() query: ListDevicesQuery) {
    return this.devices.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.devices.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateDeviceDto) {
    return this.devices.update(id, dto);
  }

  @Post(':id/enrollment-token')
  regenerate(@Param('id') id: string) {
    return this.devices.regenerateEnrollment(id);
  }

  @Get(':id/qr')
  qr(@Param('id') id: string) {
    return this.devices.enrollmentPayload(id);
  }

  @Post(':id/lock')
  @HttpCode(202)
  @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.AGENT)
  lock(
    @Param('id') id: string,
    @Body() dto: LockDeviceDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.commands.queue(id, CommandType.LOCK, {
      reason: dto.reason,
      issuedById: actor.userId,
    });
  }

  @Post(':id/unlock')
  @HttpCode(202)
  @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.AGENT)
  unlock(
    @Param('id') id: string,
    @Body() dto: LockDeviceDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.commands.queue(id, CommandType.UNLOCK, {
      reason: dto.reason,
      issuedById: actor.userId,
    });
  }

  @Post(':id/release')
  @HttpCode(202)
  @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.AGENT)
  async release(
    @Param('id') id: string,
    @Body() dto: ReleaseDeviceDto,
    @CurrentUser() actor: AuthUser,
  ) {
    // The backend decides whether release is allowed — the device never
    // releases itself. Gated on loan completion (owner may force otherwise).
    const reason = await this.devices.assertReleasable(
      id,
      actor.role,
      dto.force ?? false,
    );
    return this.commands.queue(id, CommandType.RELEASE, {
      reason: dto.reason ?? reason,
      issuedById: actor.userId,
    });
  }

  @Get(':id/commands')
  commandHistory(@Param('id') id: string) {
    return this.commands.listForDevice(id);
  }
}
