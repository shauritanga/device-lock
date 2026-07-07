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
