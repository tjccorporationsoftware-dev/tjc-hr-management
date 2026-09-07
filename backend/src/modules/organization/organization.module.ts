import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PayrollStatutoryDefaultsModule } from '../payroll/payroll-statutory-defaults.module';
import { OrganizationCatalogController } from './organization-catalog.controller';
import { OrganizationCatalogService } from './organization-catalog.service';
import { OrganizationController } from './organization.controller';
import { OrganizationService } from './organization.service';
import { OrganizationCatalogBootstrapService } from './services/organization-catalog-bootstrap.service';

@Module({
  imports: [AuthModule, PayrollStatutoryDefaultsModule],
  controllers: [OrganizationController, OrganizationCatalogController],
  providers: [
    OrganizationService,
    OrganizationCatalogService,
    OrganizationCatalogBootstrapService,
  ],
  exports: [OrganizationService],
})
export class OrganizationModule {}
