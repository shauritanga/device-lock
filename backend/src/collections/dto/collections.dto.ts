import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  CollectionCaseStatus,
  CollectionsPackage,
  CollectionsSubscriptionStatus,
  ContactChannel,
  ContactVerificationStatus,
  PromiseToPayStatus,
} from '@prisma/client';

enum PlatformStaffRole {
  COLLECTIONS_ADMIN = 'COLLECTIONS_ADMIN',
  MASTER_COLLECTOR = 'MASTER_COLLECTOR',
  COLLECTOR = 'COLLECTOR',
}

export class ActivateSubscriptionDto {
  @IsUUID()
  tenantId!: string;

  @IsEnum(CollectionsPackage)
  packageCode!: CollectionsPackage;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class AssignCaseDto {
  @IsUUID()
  assignedToId!: string;
}

export class ListCasesQuery {
  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @IsOptional()
  @IsUUID()
  assignedToId?: string;

  @IsOptional()
  @IsEnum(CollectionCaseStatus)
  status?: CollectionCaseStatus;

  /** When true (default for collectors), only cases assigned to the caller. */
  @IsOptional()
  @IsString()
  mine?: string;
}

export class CreatePlatformStaffDto {
  @IsEmail()
  email!: string;

  /** Optional: if omitted, a temporary password is generated and emailed. */
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @IsString()
  @MinLength(2)
  fullName!: string;

  @IsEnum(PlatformStaffRole)
  role!: PlatformStaffRole;

  @IsOptional()
  @IsString()
  phone?: string;

  /** Optional: assign a new COLLECTOR under this MASTER_COLLECTOR. */
  @IsOptional()
  @IsUUID()
  managedById?: string;
}

export class AssignCollectorMasterDto {
  /** MASTER_COLLECTOR user id, or null/omit to unassign. */
  @IsOptional()
  @IsUUID()
  masterCollectorId?: string | null;
}

export class UpdateCollectorPhoneDto {
  @IsString()
  @MinLength(9)
  phone!: string;
}

export class StartContactDto {
  @IsEnum(ContactChannel)
  channel!: ContactChannel;

  /** Optional SMS/WhatsApp body template text */
  @IsOptional()
  @IsString()
  body?: string;
}

export class CompleteContactDto {
  @IsOptional()
  @IsEnum(ContactVerificationStatus)
  verificationStatus?: ContactVerificationStatus;

  @IsOptional()
  @IsNumber()
  @Min(0)
  durationSeconds?: number;

  @IsOptional()
  @IsString()
  outcomeNote?: string;

  /** Device log match payload from companion app (Phase 2b) */
  @IsOptional()
  deviceMatchMeta?: Record<string, unknown>;
}

export class SubmitContactProofDto {
  /** ISO timestamp of the device call/SMS log entry */
  @IsOptional()
  @IsDateString()
  logAt?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  durationSeconds?: number;

  /** Normalized phone digits that matched */
  @IsOptional()
  @IsString()
  matchedPhone?: string;

  @IsOptional()
  @IsString()
  direction?: string; // OUTGOING

  @IsOptional()
  deviceMatchMeta?: Record<string, unknown>;
}

export class AutoAssignDto {
  /** Max cases to assign in this run (default 2000; daily cap is 55/collector) */
  @IsOptional()
  @IsNumber()
  @Min(1)
  limit?: number;
}

export class CreatePromiseDto {
  @IsNumber()
  @Min(0)
  promisedAmount!: number;

  @IsDateString()
  dueDate!: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  currency?: string;
}

export class UpdatePromiseDto {
  @IsOptional()
  @IsEnum(PromiseToPayStatus)
  status?: PromiseToPayStatus;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class ReportRangeQuery {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsUUID()
  tenantId?: string;
}

export class CollectorPerformanceQuery {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsUUID()
  collectorId?: string;

  /** day | month | year — groups rollup buckets */
  @IsOptional()
  @IsString()
  period?: string;
}

export class GenerateCollectionsInvoiceDto {
  @IsUUID()
  tenantId!: string;

  /** Optional ISO date inside the billing month; defaults to current month */
  @IsOptional()
  @IsDateString()
  asOf?: string;
}

export class MarkInvoicePaidDto {
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateCustomerKycDto {
  @IsOptional()
  @IsString()
  occupation?: string;

  @IsOptional()
  @IsString()
  employerName?: string;

  @IsOptional()
  @IsString()
  employerPhone?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  monthlyIncome?: number;
}

export class SetCaseWaiverDto {
  @IsOptional()
  @IsBoolean()
  extensionApplied?: boolean;

  @IsOptional()
  @IsBoolean()
  penaltyInterestReductionEnabled?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  penaltyInterestAmount?: number;

  /** ISO date string, or null to clear. */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsDateString()
  waiverValidUntil?: string | null;
}

export {
  CollectionsPackage,
  CollectionsSubscriptionStatus,
  CollectionCaseStatus,
  ContactChannel,
};

export class ReferCaseDto {
  /** Loan the seller wants the platform to follow up on. */
  @IsUUID()
  loanId!: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  note?: string;
}
