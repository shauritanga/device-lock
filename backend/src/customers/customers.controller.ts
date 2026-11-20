import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthUser } from '../auth/auth.types';
import { FileInterceptor } from '@nestjs/platform-express';
import { CustomersService } from './customers.service';
import {
  CreateCustomerDto,
  CreateGuardianDto,
  ReviewCustomerDto,
  UpdateCustomerDto,
} from './dto/customer.dto';

const PHOTO_MAX_BYTES = 8 * 1024 * 1024;
const PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Post()
  create(@Body() dto: CreateCustomerDto) {
    return this.customers.create(dto);
  }

  @Get()
  findAll() {
    return this.customers.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.customers.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCustomerDto) {
    return this.customers.update(id, dto);
  }

  /** Starts a phone verification: the dashboard turns the token into a QR code. */
  @Post(':id/verification-sessions')
  startVerification(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    return this.customers.createVerificationSession(id, actor.userId);
  }

  @Get(':id/verification-sessions/:sid')
  verificationStatus(@Param('id') id: string, @Param('sid') sid: string) {
    return this.customers.verificationSessionStatus(id, sid);
  }

  @Delete(':id/verification-sessions/:sid')
  cancelVerification(@Param('id') id: string, @Param('sid') sid: string) {
    return this.customers.cancelVerificationSession(id, sid);
  }

  @Post(':id/review')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  review(
    @Param('id') id: string,
    @Body() dto: ReviewCustomerDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.customers.review(id, dto, actor.userId);
  }

  @Post(':id/guardians')
  @UseInterceptors(
    FileInterceptor('photo', {
      limits: { fileSize: PHOTO_MAX_BYTES },
      fileFilter: (_req, file, cb) => cb(null, PHOTO_TYPES.has(file.mimetype)),
    }),
  )
  addGuardian(
    @Param('id') id: string,
    @Body() dto: CreateGuardianDto,
    @UploadedFile() photo?: Express.Multer.File,
  ) {
    return this.customers.addGuardian(id, dto, photo);
  }
}
