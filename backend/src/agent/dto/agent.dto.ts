import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class EnrollDto {
  @IsString()
  @MinLength(16)
  enrollmentToken!: string;

  @IsString()
  @MinLength(4)
  imei!: string;

  @IsOptional()
  @IsString()
  serialNumber?: string;

  @IsOptional()
  @IsString()
  make?: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsString()
  fcmToken?: string;

  @IsOptional()
  @IsString()
  simIccid?: string;

  @IsOptional()
  @IsString()
  simOperator?: string;

  @IsOptional()
  @IsString()
  simCountryIso?: string;

  @IsOptional()
  @IsString()
  simPhoneNumber?: string;
}

export class CheckinDto {
  @IsOptional()
  @IsString()
  fcmToken?: string;

  @IsOptional()
  @IsString()
  lockState?: string;

  @IsOptional()
  @IsBoolean()
  isDeviceOwner?: boolean;

  @IsOptional()
  @IsBoolean()
  managedRestrictionsApplied?: boolean;

  @IsOptional()
  @IsString()
  simIccid?: string;

  @IsOptional()
  @IsString()
  simOperator?: string;

  @IsOptional()
  @IsString()
  simCountryIso?: string;

  @IsOptional()
  @IsString()
  simPhoneNumber?: string;
}

export class AckDto {
  @IsIn(['DONE', 'FAILED'])
  result!: 'DONE' | 'FAILED';

  @IsOptional()
  @IsString()
  detail?: string;
}

export class PayNowDto {
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  amount?: number;

  @IsOptional()
  @IsString()
  phoneNumber?: string;
}
