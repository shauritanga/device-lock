import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { PaymentMethod } from '@prisma/client';

export class RecordPaymentDto {
  @IsString()
  loanId!: string;

  @IsNumber()
  @Min(0.01)
  amount!: number;

  // Manual entry; defaults to CASH.
  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;
}

export class InitiatePaymentDto {
  @IsString()
  loanId!: string;

  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsString()
  phoneNumber!: string; // 2557XXXXXXXX
}

/** Manual till/cash payment against one installment (defaults to full outstanding). */
export class MarkInstallmentPaidDto {
  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;

  /** Partial amount allowed; defaults to the installment's full outstanding balance. */
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  amount?: number;
}
