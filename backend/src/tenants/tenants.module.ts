import { Module } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { TenantsController } from './tenants.controller';
import { TenantSettingsController } from './tenant-settings.controller';

@Module({
  providers: [TenantsService],
  controllers: [TenantsController, TenantSettingsController],
})
export class TenantsModule {}
