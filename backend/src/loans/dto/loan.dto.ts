import { PaymentFrequency } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class CreateLoanDto {
  @IsString()
  customerId!: string;

  @IsString()
  deviceId!: string;

  @IsNumber()
  @Min(0.01)
  principal!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  downPayment?: number;

  /** Flat interest rate (%) applied once to the financed amount over the term. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  interestRate?: number;

  /** Installment frequency; defaults to MONTHLY. */
  @IsOptional()
  @IsEnum(PaymentFrequency)
  frequency?: PaymentFrequency;

  /** Number of installments (days / weeks / months depending on frequency). */
  @IsInt()
  @Min(1)
  @Max(730)
  termPeriods!: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsISO8601()
  startDate?: string;
}
