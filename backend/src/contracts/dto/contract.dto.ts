import { IsIn, IsObject, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateContractDto {
  @IsString()
  loanId!: string;

  @IsString()
  @MinLength(20)
  termsText!: string;

  @IsOptional()
  @IsIn(['en', 'sw'])
  language?: 'en' | 'sw';

  @IsOptional()
  @IsString()
  termsVersion?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
