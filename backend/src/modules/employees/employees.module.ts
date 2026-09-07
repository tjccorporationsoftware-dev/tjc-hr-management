
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { OffboardingModule } from '../offboarding/offboarding.module';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';

@Module({
  imports: [PrismaModule, OffboardingModule],
  controllers: [EmployeesController],
  providers: [EmployeesService],
  exports: [EmployeesService],
})
export class EmployeesModule {}