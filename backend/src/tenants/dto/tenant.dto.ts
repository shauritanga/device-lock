import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Min,
  MinLength,
} from 'class-validator';

export class CreateTenantDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  graceDays?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxOfflineDays?: number;

  @IsOptional()
  @IsBoolean()
  lockOnSimChange?: boolean;

  @IsOptional()
  @IsString()
  billingPlan?: string;
}

export class UpdateTenantDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  graceDays?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxOfflineDays?: number;

  /** Mobile-money number collected instalments are disbursed to (255XXXXXXXXX). */
  @IsOptional()
  @Matches(/^(\+?255|0)[67]\d{8}$/, {
    message: 'payoutPhone must be a Tanzanian mobile number',
  })
  payoutPhone?: string;

  /** Registered name on that mobile-money account. */
  @IsOptional()
  @IsString()
  @MinLength(2)
  payoutName?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  lockOnSimChange?: boolean;

  @IsOptional()
  @IsString()
  billingPlan?: string;

  @IsOptional()
  @IsString()
  subscriptionStatus?: string;
}
