import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { DemoRequestStatus, UserRole } from '@prisma/client';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { DemoRequestsService } from './demo-requests.service';
import {
  ConvertDemoRequestDto,
  CreateDemoRequestDto,
  UpdateDemoRequestDto,
} from './dto/demo-request.dto';

@Controller('demo-requests')
export class DemoRequestsController {
  constructor(private readonly demoRequests: DemoRequestsService) {}

  /** Marketing-site intake — no auth. */
  @Public()
  @Post()
  create(
    @Body() dto: CreateDemoRequestDto,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.demoRequests.create(dto, userAgent);
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.COLLECTIONS_ADMIN)
  findAll(@Query('status') status?: DemoRequestStatus) {
    return this.demoRequests.findAll(status);
  }

  @Get(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.COLLECTIONS_ADMIN)
  findOne(@Param('id') id: string) {
    return this.demoRequests.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.COLLECTIONS_ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateDemoRequestDto) {
    return this.demoRequests.update(id, dto);
  }

  @Post(':id/convert')
  @Roles(UserRole.SUPER_ADMIN)
  convert(@Param('id') id: string, @Body() dto: ConvertDemoRequestDto) {
    return this.demoRequests.convert(id, dto);
  }
}
