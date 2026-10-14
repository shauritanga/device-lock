import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { CustomersService } from './customers.service';
import { CreateCustomerDto, UpdateCustomerDto } from './dto/customer.dto';

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

  @Post(':id/photos')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'photo', maxCount: 1 },
        { name: 'idCard', maxCount: 1 },
      ],
      {
        limits: { fileSize: PHOTO_MAX_BYTES },
        fileFilter: (_req, file, cb) => cb(null, PHOTO_TYPES.has(file.mimetype)),
      },
    ),
  )
  uploadPhotos(
    @Param('id') id: string,
    @UploadedFiles()
    files: { photo?: Express.Multer.File[]; idCard?: Express.Multer.File[] },
  ) {
    return this.customers.savePhotos(id, files ?? {});
  }
}
