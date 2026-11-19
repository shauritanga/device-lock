import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
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

  /** Allocate the phone to a sales agent when it is registered. */
  @IsOptional()
  @IsString()
  assignedAgentId?: string;
}

/** Register many phones into stock at once (one IMEI per entry). */
export class BulkCreateDevicesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsString({ each: true })
  imeis!: string[];

  @IsOptional()
  @IsString()
  make?: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsString()
  assignedAgentId?: string;
}

/** Allocate stock to an agent; a null agent returns the phones to the shop. */
export class AssignDevicesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsString({ each: true })
  deviceIds!: string[];

  @IsOptional()
  @IsString()
  agentId?: string | null;
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

export class ApproveSimChangeDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

export class ListDevicesQuery {
  /** Only phones still in stock: registered, never sold, not yet enrolled. */
  @IsOptional()
  @IsIn(['true', 'false'])
  available?: string;

  @IsOptional()
  @IsEnum(DeviceStatus)
  status?: DeviceStatus;

  @IsOptional()
  @IsString()
  customerId?: string;
}
