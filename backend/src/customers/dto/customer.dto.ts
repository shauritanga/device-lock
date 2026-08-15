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

  @IsOptional()
  @IsString()
  address?: string;
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
  address?: string;
}
