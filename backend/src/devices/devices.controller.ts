import {
  Body,
  Controller,
  Delete,
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
  AssignDevicesDto,
  BulkCreateDevicesDto,
  CreateDeviceDto,
  ApproveSimChangeDto,
  ListDevicesQuery,
  LockDeviceDto,
  ReleaseDeviceDto,
  UpdateDeviceDto,
} from './dto/device.dto';

const isPlatformAdmin = (role: UserRole) =>
  role === UserRole.SUPER_ADMIN || role === UserRole.COLLECTIONS_ADMIN;

@Controller('devices')
export class DevicesController {
  constructor(
    private readonly devices: DevicesService,
    private readonly commands: CommandsService,
  ) {}

  // Sales agents never manage devices: they sell phones that were allocated to
  // them, and can only look at (not control) the ones they sold.

  @Post()
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  register(@Body() dto: CreateDeviceDto) {
    return this.devices.register(dto);
  }

  @Post('bulk')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  registerBulk(@Body() dto: BulkCreateDevicesDto) {
    return this.devices.registerBulk(dto);
  }

  @Post('assign')
  @HttpCode(200)
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  assign(@Body() dto: AssignDevicesDto) {
    return this.devices.assign(dto);
  }

  @Get()
  findAll(@Query() query: ListDevicesQuery, @CurrentUser() actor: AuthUser) {
    return this.devices.findAll(query, actor);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    await this.devices.assertVisible(id, actor);
    return this.devices.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  update(@Param('id') id: string, @Body() dto: UpdateDeviceDto) {
    return this.devices.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  remove(@Param('id') id: string) {
    return this.devices.remove(id);
  }

  @Post(':id/enrollment-token')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  regenerate(@Param('id') id: string) {
    return this.devices.regenerateEnrollment(id);
  }

  @Post(':id/approve-sim-change')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  approveSimChange(@Param('id') id: string, @Body() dto: ApproveSimChangeDto) {
    return this.devices.approveSimChange(id, dto.reason);
  }

  @Get(':id/qr')
  async qr(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    await this.devices.assertVisible(id, actor);
    return this.devices.enrollmentPayload(id);
  }

  /** Platform admins lock across all sellers; a reason is mandatory and audited. */
  @Post(':id/lock')
  @HttpCode(202)
  @Roles(
    UserRole.OWNER,
    UserRole.MANAGER,
    UserRole.SUPER_ADMIN,
    UserRole.COLLECTIONS_ADMIN,
  )
  async lock(
    @Param('id') id: string,
    @Body() dto: LockDeviceDto,
    @CurrentUser() actor: AuthUser,
  ) {
    let reason = dto.reason;
    if (isPlatformAdmin(actor.role)) {
      reason = await this.devices.auditAdminLockAction(id, 'LOCK', actor, dto.reason);
    }
    return this.commands.queue(id, CommandType.LOCK, {
      reason,
      issuedById: actor.userId,
    });
  }

  @Post(':id/unlock')
  @HttpCode(202)
  @Roles(
    UserRole.OWNER,
    UserRole.MANAGER,
    UserRole.SUPER_ADMIN,
    UserRole.COLLECTIONS_ADMIN,
  )
  async unlock(
    @Param('id') id: string,
    @Body() dto: LockDeviceDto,
    @CurrentUser() actor: AuthUser,
  ) {
    let reason = dto.reason;
    if (isPlatformAdmin(actor.role)) {
      reason = await this.devices.auditAdminLockAction(id, 'UNLOCK', actor, dto.reason);
    }
    return this.commands.queue(id, CommandType.UNLOCK, {
      reason,
      issuedById: actor.userId,
    });
  }

  @Post(':id/release')
  @HttpCode(202)
  @Roles(UserRole.OWNER, UserRole.MANAGER)
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
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  commandHistory(@Param('id') id: string) {
    return this.commands.listForDevice(id);
  }
}
