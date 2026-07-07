import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

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
}

export class CheckinDto {
  @IsOptional()
  @IsString()
  fcmToken?: string;

  @IsOptional()
  @IsString()
  lockState?: string;
}

export class AckDto {
  @IsIn(['DONE', 'FAILED'])
  result!: 'DONE' | 'FAILED';

  @IsOptional()
  @IsString()
  detail?: string;
}
