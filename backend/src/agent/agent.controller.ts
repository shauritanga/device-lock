import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { DeviceAuthGuard, DeviceIdentity } from '../common/guards/device-auth.guard';
import { CurrentDevice } from '../common/decorators/current-device.decorator';
import { AgentService } from './agent.service';
import { AckDto, CheckinDto, EnrollDto, PayNowDto } from './dto/agent.dto';

/**
 * Device-facing API spoken by the Kotlin DPC agent. Routes are @Public (no staff
 * JWT); enroll authenticates via the enrollment token, checkin/ack via the
 * per-device token (DeviceAuthGuard).
 */
@Public()
@Controller('agent')
export class AgentController {
  constructor(private readonly agent: AgentService) {}

  @Post('enroll')
  @HttpCode(200)
  enroll(@Body() dto: EnrollDto) {
    return this.agent.enroll(dto);
  }

  @Post('checkin')
  @HttpCode(200)
  @UseGuards(DeviceAuthGuard)
  checkin(@CurrentDevice() device: DeviceIdentity, @Body() dto: CheckinDto) {
    return this.agent.checkin(device.deviceId, dto);
  }

  @Get('customer-summary')
  @UseGuards(DeviceAuthGuard)
  customerSummary(@CurrentDevice() device: DeviceIdentity) {
    return this.agent.customerSummary(device.deviceId);
  }

  @Post('pay-now')
  @HttpCode(200)
  @UseGuards(DeviceAuthGuard)
  payNow(@CurrentDevice() device: DeviceIdentity, @Body() dto: PayNowDto) {
    return this.agent.payNow(device.deviceId, dto);
  }

  @Post('commands/:id/ack')
  @HttpCode(200)
  @UseGuards(DeviceAuthGuard)
  ack(
    @CurrentDevice() device: DeviceIdentity,
    @Param('id') id: string,
    @Body() dto: AckDto,
  ) {
    return this.agent.ack(device.deviceId, id, dto);
  }
}
