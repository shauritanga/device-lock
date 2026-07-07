import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { UserRole } from '@prisma/client';

// Roles that can be assigned via the API (never SUPER_ADMIN).
export enum AssignableRole {
  OWNER = 'OWNER',
  MANAGER = 'MANAGER',
  AGENT = 'AGENT',
}

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  @MinLength(2)
  fullName!: string;

  @IsEnum(AssignableRole)
  role!: AssignableRole;

  // Only honoured for SUPER_ADMIN callers (which tenant to create the user in).
  @IsOptional()
  @IsString()
  tenantId?: string;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  fullName?: string;

  @IsOptional()
  @IsEnum(AssignableRole)
  role?: AssignableRole;

  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export type Role = UserRole;
