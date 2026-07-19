import { IsDateString, IsIn, IsOptional, IsString } from 'class-validator';

export class CreateCallFollowUpDto {
  @IsString()
  loanId!: string;

  @IsIn(['NO_ANSWER', 'PROMISE_TO_PAY', 'DISPUTE', 'PAID_ALREADY', 'WRONG_NUMBER', 'ESCALATED', 'GENERAL_NOTE'])
  outcome!: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsDateString()
  promiseToPayAt?: string;

  @IsOptional()
  @IsIn(['NONE', 'WATCH', 'MANAGER_REVIEW', 'FIELD_VISIT', 'REPOSSESSION_REVIEW'])
  escalationStatus?: string;

  @IsOptional()
  @IsString()
  assignedToId?: string;

  @IsOptional()
  @IsDateString()
  nextFollowUpAt?: string;
}

export class StartCallDto {
  @IsString()
  loanId!: string;

  @IsOptional()
  @IsString()
  staffPhone?: string;
}

export class AssignCallDto {
  @IsString()
  loanId!: string;

  @IsString()
  assignedToId!: string;

  @IsOptional()
  @IsDateString()
  nextFollowUpAt?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CompleteCallDto extends CreateCallFollowUpDto {
  @IsString()
  attemptId!: string;
}

export class CallProviderCallbackDto {
  @IsOptional()
  @IsString()
  attemptId?: string;

  @IsOptional()
  @IsString()
  providerCallId?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  durationSeconds?: number;

  @IsOptional()
  @IsString()
  recordingUrl?: string;
}
