import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { IdDocumentType } from '@prisma/client';

export class CreateCustomerDto {
  @IsString()
  @MinLength(2)
  fullName!: string;

  @IsString()
  @MinLength(7)
  phone!: string;

  @IsString()
  @MinLength(4)
  nationalId!: string;

  @IsEnum(IdDocumentType)
  idDocumentType!: IdDocumentType;

  @IsString()
  @MinLength(3)
  address!: string;
}

export class UpdateCustomerDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  fullName?: string;

  @IsOptional()
  @IsString()
  @MinLength(7)
  phone?: string;

  @IsOptional()
  @IsString()
  @MinLength(4)
  nationalId?: string;

  @IsOptional()
  @IsEnum(IdDocumentType)
  idDocumentType?: IdDocumentType;

  @IsOptional()
  @IsString()
  @MinLength(3)
  address?: string;
}

export class CreateGuardianDto {
  @IsString()
  @MinLength(2)
  fullName!: string;

  /** e.g. Parent, Spouse, Sibling, Employer, Friend. */
  @IsString()
  @MinLength(2)
  relationship!: string;

  @IsString()
  @MinLength(7)
  phone!: string;

  @IsEnum(IdDocumentType)
  idDocumentType!: IdDocumentType;

  @IsString()
  @MinLength(4)
  nationalId!: string;

  @IsString()
  @MinLength(3)
  address!: string;
}
