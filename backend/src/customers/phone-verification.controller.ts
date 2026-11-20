import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Public } from '../common/decorators/public.decorator';
import { CurrentVerification } from '../common/decorators/current-verification.decorator';
import {
  VerificationIdentity,
  VerificationSessionGuard,
} from '../common/guards/verification-session.guard';
import { CustomersService } from './customers.service';
import { VerifyCustomerDto } from './dto/customer.dto';

const PHOTO_MAX_BYTES = 8 * 1024 * 1024;
const PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const upload = FileInterceptor('photo', {
  limits: { fileSize: PHOTO_MAX_BYTES },
  fileFilter: (_req, file, cb) => cb(null, PHOTO_TYPES.has(file.mimetype)),
});

/**
 * Spoken by the phone that scanned the verification QR code. No staff login:
 * the one-time token in the URL is the credential (VerificationSessionGuard).
 */
@Public()
@Controller('verify/:token')
@UseGuards(VerificationSessionGuard)
export class PhoneVerificationController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  info(@CurrentVerification() v: VerificationIdentity) {
    return this.customers.phoneSessionInfo(v);
  }

  @Post('id-front')
  @HttpCode(200)
  @UseInterceptors(upload)
  idFront(@CurrentVerification() v: VerificationIdentity, @UploadedFile() photo?: Express.Multer.File) {
    return this.customers.phoneSaveId(v, 'front', photo);
  }

  @Post('id-back')
  @HttpCode(200)
  @UseInterceptors(upload)
  idBack(@CurrentVerification() v: VerificationIdentity, @UploadedFile() photo?: Express.Multer.File) {
    return this.customers.phoneSaveId(v, 'back', photo);
  }

  @Post('complete')
  @HttpCode(200)
  @UseInterceptors(upload)
  complete(
    @CurrentVerification() v: VerificationIdentity,
    @Body() dto: VerifyCustomerDto,
    @UploadedFile() photo?: Express.Multer.File,
  ) {
    return this.customers.phoneComplete(v, photo, dto);
  }
}
