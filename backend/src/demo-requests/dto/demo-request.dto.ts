import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { DemoRequestStatus } from '@prisma/client';

export class CreateDemoRequestDto {
  @IsString()
  @MinLength(2)
  fullName!: string;

  @IsString()
  @MinLength(2)
  companyName!: string;

  @IsString()
  @MinLength(7)
  phone!: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  devicesPerMonth?: string;

  @IsOptional()
  @IsString()
  message?: string;
}

export class UpdateDemoRequestDto {
  @IsOptional()
  @IsEnum(DemoRequestStatus)
  status?: DemoRequestStatus;

  @IsOptional()
  @IsString()
  adminNotes?: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}

export class ConvertDemoRequestDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  tenantName?: string;

  @IsOptional()
  @IsString()
  billingPlan?: string;

  /** OWNER login email (defaults to the lead email). Required if lead has none. */
  @IsOptional()
  @IsEmail()
  ownerEmail?: string;
}
