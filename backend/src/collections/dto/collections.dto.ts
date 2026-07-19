import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
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

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  @MinLength(2)
  fullName!: string;

  @IsEnum(PlatformStaffRole)
  role!: PlatformStaffRole;

  @IsOptional()
  @IsString()
  phone?: string;
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
  /** Max cases to assign in this run (default 50) */
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

export {
  CollectionsPackage,
  CollectionsSubscriptionStatus,
  CollectionCaseStatus,
  ContactChannel,
};
