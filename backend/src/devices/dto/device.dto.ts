import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { DeviceStatus } from '@prisma/client';

export class CreateDeviceDto {
  @IsString()
  @MinLength(4)
  imei!: string;

  @IsOptional()
  @IsString()
  serialNumber?: string;

  @IsOptional()
  @IsString()
  make?: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsString()
  customerId?: string;
}

export class UpdateDeviceDto {
  @IsOptional()
  @IsString()
  make?: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  graceDays?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxOfflineDays?: number;
}

export class LockDeviceDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

export class ReleaseDeviceDto {
  @IsOptional()
  @IsString()
  reason?: string;

  /**
   * Release before the loan is COMPLETED (write-off / recovery). Owner-only and
   * audited; without it, release is refused unless the loan is fully paid.
   */
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}

export class ListDevicesQuery {
  @IsOptional()
  @IsEnum(DeviceStatus)
  status?: DeviceStatus;

  @IsOptional()
  @IsString()
  customerId?: string;
}
