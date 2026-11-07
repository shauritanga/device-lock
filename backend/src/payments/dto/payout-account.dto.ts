import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

const TZ_MOBILE = /^(\+?255|0)[67]\d{8}$/;

export class AdminPayoutAccountDto {
  @Matches(TZ_MOBILE, { message: 'phone must be a Tanzanian mobile number' })
  phone!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;
}

export class OwnerPayoutAccountDto extends AdminPayoutAccountDto {
  /** The owner's current password, re-entered to authorise the change. */
  @IsString()
  @MinLength(1)
  password!: string;
}
