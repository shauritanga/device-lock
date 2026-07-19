import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ClsModule } from 'nestjs-cls';
import { validateEnv } from './config/env.validation';
import { PrismaModule } from './common/prisma/prisma.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { HealthController } from './health/health.controller';
import { AuthModule } from './auth/auth.module';
import { TenantsModule } from './tenants/tenants.module';
import { UsersModule } from './users/users.module';
import { CustomersModule } from './customers/customers.module';
import { DevicesModule } from './devices/devices.module';
import { LoansModule } from './loans/loans.module';
import { ContractsModule } from './contracts/contracts.module';
import { CommandsModule } from './commands/commands.module';
import { AgentModule } from './agent/agent.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ClickPesaModule } from './integrations/clickpesa/clickpesa.module';
import { PaymentsModule } from './payments/payments.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { JobsModule } from './jobs/jobs.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { ProvisioningModule } from './provisioning/provisioning.module';
import { CallCentreModule } from './call-centre/call-centre.module';
import { BillingModule } from './billing/billing.module';
import { CollectionsModule } from './collections/collections.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ClsModule.forRoot({ global: true, middleware: { mount: true } }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    TenantsModule,
    UsersModule,
    CustomersModule,
    DevicesModule,
    LoansModule,
    ContractsModule,
    CommandsModule,
    AgentModule,
    NotificationsModule,
    ClickPesaModule,
    PaymentsModule,
    WebhooksModule,
    JobsModule,
    DashboardModule,
    ProvisioningModule,
    CallCentreModule,
    BillingModule,
    CollectionsModule,
  ],
  controllers: [HealthController],
  providers: [
    // Auth runs first (sets request.user + CLS tenant), then role checks.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
