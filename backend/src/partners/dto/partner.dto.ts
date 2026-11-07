import { Type } from 'class-transformer';
import { IdDocumentType } from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsDefined,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class CreatePartnerDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsEmail()
  contactEmail!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  webhookUrl?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(6000)
  rateLimitPerMin?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  tenantIds?: string[];
}

export enum EditablePartnerStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
}

export class UpdatePartnerDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  /** null clears the webhook URL. */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(500)
  webhookUrl?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(6000)
  rateLimitPerMin?: number;

  @IsOptional()
  @IsEnum(EditablePartnerStatus)
  status?: EditablePartnerStatus;
}

export class GrantTenantDto {
  @IsUUID()
  tenantId!: string;
}

export class PartnerLockDto {
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason!: string;

  /** Caller-chosen unique id; retrying with the same key never creates a second command. */
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  idempotencyKey!: string;
}

export class CreateApiKeyDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @IsBoolean()
  readOnly?: boolean;
}

export class UpdateApiKeyDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string;

  /** null clears the webhook URL. */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(500)
  webhookUrl?: string | null;
}


/** A customer as the partner knows them. `externalId` is the partner's own id for them. */
export class PartnerCustomerDto {
  /** The customer's id in the partner's system. Makes the call idempotent. */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  externalId?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  fullName!: string;

  @IsString()
  @MinLength(7)
  @MaxLength(20)
  phone!: string;

  @IsOptional()
  @IsString()
  @MinLength(4)
  @MaxLength(64)
  nationalId?: string;

  @IsOptional()
  @IsEnum(IdDocumentType)
  idDocumentType?: IdDocumentType;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;
}

/** A phone as the partner knows it. Give `customerId` or `externalCustomerId` to link it. */
export class PartnerDeviceDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  externalId?: string;

  @IsString()
  @MinLength(14)
  @MaxLength(17)
  imei!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  serialNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  make?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  model?: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  externalCustomerId?: string;
}

export class PartnerRegistrationDeviceDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  externalId?: string;

  @IsString()
  @MinLength(14)
  @MaxLength(17)
  imei!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  serialNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  make?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  model?: string;
}

/** Customer and phone in one call: what a partner sends when a sale is made in their system. */
export class PartnerRegistrationDto {
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => PartnerCustomerDto)
  customer!: PartnerCustomerDto;

  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => PartnerRegistrationDeviceDto)
  device!: PartnerRegistrationDeviceDto;
}
