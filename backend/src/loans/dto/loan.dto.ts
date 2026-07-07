import {
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
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

  @IsInt()
  @Min(1)
  termMonths!: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsISO8601()
  startDate?: string;
}
