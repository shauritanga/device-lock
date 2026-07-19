import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthUser } from '../auth/auth.types';
import { CallCentreService } from './call-centre.service';
import {
  CallProviderCallbackDto,
  AssignCallDto,
  CompleteCallDto,
  CreateCallFollowUpDto,
  StartCallDto,
} from './dto/call-centre.dto';

@Controller('call-centre')
export class CallCentreController {
  constructor(private readonly service: CallCentreService) {}

  @Get('queue')
  queue() {
    return this.service.queue();
  }

  @Get('follow-ups')
  followUps() {
    return this.service.listFollowUps();
  }

  @Get('performance')
  performance() {
    return this.service.performance();
  }

  @Get('attempts')
  attempts() {
    return this.service.listAttempts();
  }

  @Post('calls/start')
  @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.AGENT)
  startCall(@Body() dto: StartCallDto, @CurrentUser() actor: AuthUser) {
    return this.service.startCall(dto, actor.userId);
  }

  @Post('assignments')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  assign(@Body() dto: AssignCallDto, @CurrentUser() actor: AuthUser) {
    return this.service.assign(dto, actor.userId);
  }

  @Post('calls/complete')
  @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.AGENT)
  completeCall(@Body() dto: CompleteCallDto, @CurrentUser() actor: AuthUser) {
    return this.service.completeCall(dto, actor.userId);
  }

  @Public()
  @Post('calls/callback')
  @HttpCode(200)
  callback(@Body() dto: CallProviderCallbackDto & Record<string, any>) {
    return this.service.providerCallback(dto, dto);
  }

  @Post('follow-ups')
  @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.AGENT)
  create(@Body() dto: CreateCallFollowUpDto, @CurrentUser() actor: AuthUser) {
    return this.service.create(dto, actor.userId);
  }
}
