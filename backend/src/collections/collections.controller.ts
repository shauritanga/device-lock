import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/auth.types';
import { CollectionsService } from './collections.service';
import {
  ActivateSubscriptionDto,
  AssignCaseDto,
  AssignCollectorMasterDto,
  AutoAssignDto,
  CompleteContactDto,
  CreatePlatformStaffDto,
  CreatePromiseDto,
  ListCasesQuery,
  CollectorPerformanceQuery,
  GenerateCollectionsInvoiceDto,
  MarkInvoicePaidDto,
  ReferCaseDto,
  ReportRangeQuery,
  SetCaseWaiverDto,
  StartContactDto,
  SubmitContactProofDto,
  UpdateCollectorPhoneDto,
  UpdateCustomerKycDto,
  UpdatePromiseDto,
} from './dto/collections.dto';
import { PromiseToPayStatus } from '@prisma/client';

const KYC_PHOTO_MAX_BYTES = 8 * 1024 * 1024;
const KYC_PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

@Controller('collections')
export class CollectionsController {
  constructor(private readonly collections: CollectionsService) {}

  @Get('packages')
  listPackages() {
    return this.collections.listPackages();
  }

  @Get('subscriptions/me')
  @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.AGENT)
  mySubscription(@CurrentUser() actor: AuthUser) {
    return this.collections.mySubscription(actor);
  }

  @Get('subscriptions')
  @Roles(UserRole.SUPER_ADMIN, UserRole.COLLECTIONS_ADMIN)
  listSubscriptions(@CurrentUser() actor: AuthUser) {
    return this.collections.listSubscriptions(actor);
  }

  @Post('subscriptions/activate')
  @Roles(UserRole.SUPER_ADMIN, UserRole.COLLECTIONS_ADMIN)
  activate(
    @Body() dto: ActivateSubscriptionDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.collections.activate(dto, actor);
  }

  @Post('subscriptions/:tenantId/suspend')
  @Roles(UserRole.SUPER_ADMIN, UserRole.COLLECTIONS_ADMIN)
  suspend(
    @Param('tenantId') tenantId: string,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.collections.suspend(tenantId, actor);
  }

  @Post('sync')
  @Roles(UserRole.SUPER_ADMIN, UserRole.COLLECTIONS_ADMIN)
  syncAll(@CurrentUser() actor: AuthUser) {
    return this.collections.syncAndAutoAssign(actor);
  }

  @Get('cases')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.COLLECTIONS_ADMIN,
    UserRole.COLLECTOR,
    UserRole.MASTER_COLLECTOR,
    UserRole.OWNER,
    UserRole.MANAGER,
    UserRole.AGENT,
  )
  listCases(@Query() query: ListCasesQuery, @CurrentUser() actor: AuthUser) {
    return this.collections.listCases(query, actor);
  }

  @Get('cases/referable')
  @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.AGENT)
  listReferableLoans(@CurrentUser() user: AuthUser) {
    return this.collections.listReferableLoans(user);
  }

  /** Seller hands a loan to the platform call centre (subscription required). */
  @Post('cases/refer')
  @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.AGENT)
  referCase(@Body() dto: ReferCaseDto, @CurrentUser() user: AuthUser) {
    return this.collections.referCase(dto, user);
  }

  @Get('cases/unassigned')
  @Roles(UserRole.SUPER_ADMIN, UserRole.COLLECTIONS_ADMIN)
  unassigned(@CurrentUser() actor: AuthUser) {
    return this.collections.unassignedQueue(actor);
  }

  @Get('cases/mine')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.COLLECTIONS_ADMIN,
    UserRole.COLLECTOR,
    UserRole.MASTER_COLLECTOR,
  )
  mine(@CurrentUser() actor: AuthUser) {
    return this.collections.myQueue(actor);
  }

  @Get('cases/:id')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.COLLECTIONS_ADMIN,
    UserRole.COLLECTOR,
    UserRole.MASTER_COLLECTOR,
    UserRole.OWNER,
    UserRole.MANAGER,
    UserRole.AGENT,
  )
  getCase(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    return this.collections.getCase(id, actor);
  }

  @Post('cases/:id/assign')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.COLLECTIONS_ADMIN,
    UserRole.MASTER_COLLECTOR,
  )
  assign(
    @Param('id') id: string,
    @Body() dto: AssignCaseDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.collections.assign(id, dto, actor);
  }

  @Post('cases/:id/unassign')
  @Roles(UserRole.SUPER_ADMIN, UserRole.COLLECTIONS_ADMIN)
  unassign(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    return this.collections.unassign(id, actor);
  }

  @Get('collectors')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.COLLECTIONS_ADMIN,
    UserRole.MASTER_COLLECTOR,
  )
  collectors(@CurrentUser() actor: AuthUser) {
    return this.collections.listCollectors(actor);
  }

  @Post('collectors')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.COLLECTIONS_ADMIN,
    UserRole.MASTER_COLLECTOR,
  )
  createCollector(
    @Body() dto: CreatePlatformStaffDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.collections.createPlatformStaff(dto, actor);
  }

  @Patch('collectors/:id/master')
  @Roles(UserRole.SUPER_ADMIN, UserRole.COLLECTIONS_ADMIN)
  assignMaster(
    @Param('id') id: string,
    @Body() dto: AssignCollectorMasterDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.collections.assignCollectorMaster(id, dto, actor);
  }

  @Patch('me/phone')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.COLLECTIONS_ADMIN,
    UserRole.MASTER_COLLECTOR,
    UserRole.COLLECTOR,
  )
  updatePhone(
    @Body() dto: UpdateCollectorPhoneDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.collections.updateMyPhone(dto, actor);
  }

  @Post('cases/:id/contact-sessions')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.COLLECTIONS_ADMIN,
    UserRole.COLLECTOR,
    UserRole.MASTER_COLLECTOR,
  )
  startContact(
    @Param('id') id: string,
    @Body() dto: StartContactDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.collections.startContact(id, dto, actor);
  }

  @Post('contact-sessions/:id/complete')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.COLLECTIONS_ADMIN,
    UserRole.COLLECTOR,
    UserRole.MASTER_COLLECTOR,
  )
  completeContact(
    @Param('id') id: string,
    @Body() dto: CompleteContactDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.collections.completeContact(id, dto, actor);
  }

  @Post('contact-sessions/:id/proof')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.COLLECTIONS_ADMIN,
    UserRole.COLLECTOR,
    UserRole.MASTER_COLLECTOR,
  )
  submitProof(
    @Param('id') id: string,
    @Body() dto: SubmitContactProofDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.collections.submitContactProof(id, dto, actor);
  }

  @Post('cases/auto-assign')
  @Roles(UserRole.SUPER_ADMIN, UserRole.COLLECTIONS_ADMIN)
  autoAssign(
    @Body() dto: AutoAssignDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.collections.autoAssignUnassigned(actor, dto.limit ?? 2000);
  }

  @Get('activity/me')
  @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.AGENT)
  sellerActivity(
    @CurrentUser() actor: AuthUser,
    @Query('days') days?: string,
  ) {
    return this.collections.sellerActivitySummary(
      actor,
      days ? Number(days) : 7,
    );
  }

  @Post('cases/:id/promises')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.COLLECTIONS_ADMIN,
    UserRole.COLLECTOR,
    UserRole.MASTER_COLLECTOR,
  )
  createPromise(
    @Param('id') id: string,
    @Body() dto: CreatePromiseDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.collections.createPromise(id, dto, actor);
  }

  @Get('promises')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.COLLECTIONS_ADMIN,
    UserRole.COLLECTOR,
    UserRole.MASTER_COLLECTOR,
    UserRole.OWNER,
    UserRole.MANAGER,
  )
  listPromises(
    @CurrentUser() actor: AuthUser,
    @Query('status') status?: PromiseToPayStatus,
  ) {
    return this.collections.listPromises(actor, status);
  }

  @Patch('promises/:id')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.COLLECTIONS_ADMIN,
    UserRole.COLLECTOR,
    UserRole.MASTER_COLLECTOR,
  )
  updatePromise(
    @Param('id') id: string,
    @Body() dto: UpdatePromiseDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.collections.updatePromise(id, dto, actor);
  }

  @Patch('cases/:id/waiver')
  @Roles(UserRole.SUPER_ADMIN, UserRole.COLLECTIONS_ADMIN)
  setCaseWaiver(
    @Param('id') id: string,
    @Body() dto: SetCaseWaiverDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.collections.setCaseWaiver(id, dto, actor);
  }

  @Patch('customers/:id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.COLLECTIONS_ADMIN)
  updateCustomerKyc(
    @Param('id') id: string,
    @Body() dto: UpdateCustomerKycDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.collections.updateCustomerKyc(id, dto, actor);
  }

  @Post('customers/:id/kyc-photos')
  @Roles(UserRole.SUPER_ADMIN, UserRole.COLLECTIONS_ADMIN)
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'idCard', maxCount: 1 },
        { name: 'selfie', maxCount: 1 },
      ],
      {
        // No `storage` option => multer buffers files in memory; the
        // service writes them to disk itself (see kycUploadDir /
        // saveCustomerKycPhotos), since the on-disk destination depends on
        // the injected CollectionsService which multer's config can't see.
        limits: { fileSize: KYC_PHOTO_MAX_BYTES },
        fileFilter: (_req, file, cb) => {
          cb(null, KYC_PHOTO_TYPES.has(file.mimetype));
        },
      },
    ),
  )
  uploadCustomerKycPhotos(
    @Param('id') id: string,
    @UploadedFiles()
    files: { idCard?: Express.Multer.File[]; selfie?: Express.Multer.File[] },
    @CurrentUser() actor: AuthUser,
  ) {
    if (!files?.idCard?.length && !files?.selfie?.length) {
      throw new BadRequestException(
        'Attach at least one file: idCard and/or selfie',
      );
    }
    return this.collections.saveCustomerKycPhotos(id, files, actor);
  }

  @Get('reports/paid-cases')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.COLLECTIONS_ADMIN,
    UserRole.OWNER,
    UserRole.MANAGER,
  )
  paidCases(@Query() query: ReportRangeQuery, @CurrentUser() actor: AuthUser) {
    return this.collections.paidCasesReport(query, actor);
  }

  @Get('reports/paid-cases.csv')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.COLLECTIONS_ADMIN,
    UserRole.OWNER,
    UserRole.MANAGER,
  )
  async paidCasesCsv(
    @Query() query: ReportRangeQuery,
    @CurrentUser() actor: AuthUser,
    @Res() res: Response,
  ) {
    const rows = await this.collections.paidCasesReport(query, actor);
    const csv = this.collections.paidCasesCsv(rows);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="paid-cases.csv"',
    );
    res.send(csv);
  }

  @Get('reports/payment-stats')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.COLLECTIONS_ADMIN,
    UserRole.OWNER,
    UserRole.MANAGER,
    UserRole.COLLECTOR,
    UserRole.MASTER_COLLECTOR,
  )
  paymentStats(
    @Query() query: ReportRangeQuery,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.collections.paymentStats(query, actor);
  }

  @Get('reports/case-followups/:caseId')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.COLLECTIONS_ADMIN,
    UserRole.COLLECTOR,
    UserRole.MASTER_COLLECTOR,
    UserRole.OWNER,
    UserRole.MANAGER,
  )
  caseFollowups(
    @Param('caseId') caseId: string,
    @Query() query: ReportRangeQuery,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.collections.caseFollowupStats(caseId, query, actor);
  }

  @Post('work-sessions/clock-in')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.COLLECTIONS_ADMIN,
    UserRole.COLLECTOR,
    UserRole.MASTER_COLLECTOR,
  )
  clockIn(@CurrentUser() actor: AuthUser) {
    return this.collections.clockIn(actor);
  }

  @Post('work-sessions/clock-out')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.COLLECTIONS_ADMIN,
    UserRole.COLLECTOR,
    UserRole.MASTER_COLLECTOR,
  )
  clockOut(@CurrentUser() actor: AuthUser) {
    return this.collections.clockOut(actor);
  }

  @Get('work-sessions/me')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.COLLECTIONS_ADMIN,
    UserRole.COLLECTOR,
    UserRole.MASTER_COLLECTOR,
  )
  myWorkSession(@CurrentUser() actor: AuthUser) {
    return this.collections.myWorkSession(actor);
  }

  @Get('reports/collector-performance')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.COLLECTIONS_ADMIN,
    UserRole.COLLECTOR,
    UserRole.MASTER_COLLECTOR,
  )
  collectorPerformance(
    @Query() query: CollectorPerformanceQuery,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.collections.collectorPerformance(query, actor);
  }

  @Get('reports/collector-performance.csv')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.COLLECTIONS_ADMIN,
    UserRole.COLLECTOR,
    UserRole.MASTER_COLLECTOR,
  )
  async collectorPerformanceCsv(
    @Query() query: CollectorPerformanceQuery,
    @CurrentUser() actor: AuthUser,
    @Res() res: Response,
  ) {
    const data = await this.collections.collectorPerformance(query, actor);
    const csv = this.collections.collectorPerformanceCsv(data);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="collector-performance.csv"',
    );
    res.send(csv);
  }

  @Post('reports/roll-daily')
  @Roles(UserRole.SUPER_ADMIN, UserRole.COLLECTIONS_ADMIN)
  rollDaily() {
    return this.collections.rollAllCollectorsDaily();
  }

  // --- Phase 5: collections package invoices ---

  @Get('billing/summary')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.COLLECTIONS_ADMIN,
    UserRole.OWNER,
    UserRole.MANAGER,
  )
  billingSummary(
    @CurrentUser() actor: AuthUser,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.collections.billingSummaryForTenant(actor, tenantId);
  }

  @Get('invoices')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.COLLECTIONS_ADMIN,
    UserRole.OWNER,
    UserRole.MANAGER,
  )
  listInvoices(
    @CurrentUser() actor: AuthUser,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.collections.listCollectionsInvoices(actor, tenantId);
  }

  @Post('invoices/generate')
  @Roles(UserRole.SUPER_ADMIN, UserRole.COLLECTIONS_ADMIN)
  generateInvoice(
    @Body() dto: GenerateCollectionsInvoiceDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.collections.generateCollectionsInvoice(dto, actor);
  }

  @Post('invoices/generate-all')
  @Roles(UserRole.SUPER_ADMIN, UserRole.COLLECTIONS_ADMIN)
  generateAll(
    @CurrentUser() actor: AuthUser,
    @Body() body?: { asOf?: string },
  ) {
    return this.collections.generateAllOpenMonth(actor, body?.asOf);
  }

  @Post('invoices/:id/mark-paid')
  @Roles(UserRole.SUPER_ADMIN, UserRole.COLLECTIONS_ADMIN)
  markPaid(
    @Param('id') id: string,
    @Body() dto: MarkInvoicePaidDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.collections.markInvoicePaid(id, dto, actor);
  }

  @Post('invoices/:id/void')
  @Roles(UserRole.SUPER_ADMIN, UserRole.COLLECTIONS_ADMIN)
  voidInvoice(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    return this.collections.voidInvoice(id, actor);
  }

  @Post('invoices/process-past-due')
  @Roles(UserRole.SUPER_ADMIN, UserRole.COLLECTIONS_ADMIN)
  processPastDue(@CurrentUser() actor: AuthUser) {
    return this.collections.processPastDueInvoices(actor);
  }
}
