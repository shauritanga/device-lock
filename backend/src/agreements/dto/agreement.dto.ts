import {
  Equals,
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/** PNG data URL, capped so a signature can't bloat the row. */
const SIGNATURE_RE = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/;
const SIGNATURE_MAX = 300_000;

export class CreateAgreementDto {
  @IsUUID()
  tenantId!: string;

  @IsString()
  @MinLength(2)
  clientName!: string;

  @IsString()
  @MinLength(3)
  clientAddress!: string;

  @IsEmail()
  clientEmail!: string;

  @IsOptional()
  @IsString()
  clientPhone?: string;

  @IsString()
  @MinLength(2)
  providerName!: string;

  @IsString()
  @MinLength(3)
  providerAddress!: string;

  @IsOptional()
  @IsEmail()
  providerEmail?: string;

  @IsOptional()
  @IsString()
  providerPhone?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  feePerDevice?: number;
}

export class UpdateAgreementDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  clientName?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  clientAddress?: string;

  @IsOptional()
  @IsEmail()
  clientEmail?: string;

  @IsOptional()
  @IsString()
  clientPhone?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  providerName?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  providerAddress?: string;

  @IsOptional()
  @IsEmail()
  providerEmail?: string;

  @IsOptional()
  @IsString()
  providerPhone?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  feePerDevice?: number;
}

export class SignAgreementDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  signatoryName!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  signatoryTitle!: string;

  @IsString()
  @MaxLength(SIGNATURE_MAX)
  @Matches(SIGNATURE_RE, { message: 'signature must be a PNG data URL' })
  signature!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  witnessName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(SIGNATURE_MAX)
  @Matches(SIGNATURE_RE, { message: 'witnessSignature must be a PNG data URL' })
  witnessSignature?: string;

  @IsBoolean()
  @Equals(true, { message: 'You must confirm you are authorized to sign' })
  authorized!: boolean;
}

export class VoidAgreementDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
