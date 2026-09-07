import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { SettingsModule } from '../settings/settings.module';
import { PayrollStatutoryDefaultsModule } from './payroll-statutory-defaults.module';
import { PayrollController } from './payroll.controller';
import { PayrollTaxController } from './payroll-tax.controller';
import { EmployeeDeductionPlansController } from './employee-deduction-plans.controller';
import { EmployeeDeductionPlansService } from './services/employee-deduction-plans.service';
import { PayrollFilingReportController } from './payroll-filing-report.controller';
import { PayrollWorkmenCompensationController } from './payroll-workmen-compensation.controller';
import { PayrollSeveranceController } from './payroll-severance.controller';
import { PayrollSeveranceService } from './services/payroll-severance.service';
import { PayrollFilingReportService } from './services/payroll-filing-report.service';
import { PayrollWorkmenCompensationService } from './services/payroll-workmen-compensation.service';
import { PayrollService } from './payroll.service';
import { PayrollHandoffReadinessService } from './services/payroll-handoff-readiness.service';
import { PayrollHandoffImportService } from './services/payroll-handoff-import.service';
import { EmployeeCompensationItemsService } from './services/employee-compensation-items.service';
import { PayrollRecurringLinesService } from './services/payroll-recurring-lines.service';
import { PayrollAdjustmentsService } from './services/payroll-adjustments.service';
import { PayrollAdjustmentImportService } from './services/payroll-adjustment-import.service';
import { AttendancePayrollRulesService } from './services/attendance-payroll-rules.service';
import { PayrollAttendanceDeductionImportService } from './services/payroll-attendance-deduction-import.service';
import { PayrollReadinessService } from './services/payroll-readiness.service';
import { PayrollLineAuditService } from './services/payroll-line-audit.service';
import { PayrollSocialSecurityService } from './services/payroll-social-security.service';
import { PayrollDeductionPlanService } from './services/payroll-deduction-plan.service';
import { PayrollTaxService } from './services/payroll-tax.service';
import { PayrollTaxCalculatorService } from './services/payroll-tax-calculator.service';
import { PayrollTaxReportService } from './services/payroll-tax-report.service';
import { PayrollSourcePreviewService } from './services/payroll-source-preview.service';
import { PayrollCalculationVerificationService } from './services/payroll-calculation-verification.service';
import { PayrollProgressService } from './services/payroll-progress.service';

/**
 * PayrollModule
 *
 * รวมระบบเงินเดือนหลัก เช่น component, period, compensation, payroll run, payslip
 *
 * Phase 6 refactor:
 * - ยังไม่เปลี่ยน endpoint เดิม
 * - เพิ่ม PayrollHandoffReadinessService สำหรับนับรายการพร้อมเข้า payroll
 * - เพิ่ม PayrollHandoffImportService สำหรับแปลง HR Review เป็น PayrollLine
 * - คง PayrollService เป็น facade หลัก เพื่อไม่ให้ controller/frontend เดิมพัง
 */
@Module({
  imports: [PrismaModule, SettingsModule, PayrollStatutoryDefaultsModule],
  controllers: [
    PayrollController,
    PayrollTaxController,
    EmployeeDeductionPlansController,
    PayrollFilingReportController,
    PayrollWorkmenCompensationController,
    PayrollSeveranceController,
  ],
  providers: [
    PayrollService,
    PayrollHandoffReadinessService,
    PayrollHandoffImportService,
    EmployeeCompensationItemsService,
    PayrollRecurringLinesService,
    PayrollAdjustmentsService,
    PayrollAdjustmentImportService,
    AttendancePayrollRulesService,
    PayrollAttendanceDeductionImportService,
    PayrollReadinessService,
    PayrollLineAuditService,
    PayrollSocialSecurityService,
    PayrollDeductionPlanService,
    EmployeeDeductionPlansService,
    PayrollFilingReportService,
    PayrollWorkmenCompensationService,
    PayrollSeveranceService,
    PayrollTaxService,
    PayrollTaxCalculatorService,
    PayrollTaxReportService,
    PayrollSourcePreviewService,
    PayrollCalculationVerificationService,
    PayrollProgressService,
  ],
  exports: [
    PayrollService,
    PayrollHandoffReadinessService,
    PayrollHandoffImportService,
    EmployeeCompensationItemsService,
    PayrollRecurringLinesService,
    PayrollAdjustmentsService,
    PayrollAdjustmentImportService,
    AttendancePayrollRulesService,
    PayrollAttendanceDeductionImportService,
    PayrollReadinessService,
    PayrollLineAuditService,
    PayrollSocialSecurityService,
    PayrollDeductionPlanService,
    EmployeeDeductionPlansService,
    PayrollFilingReportService,
    PayrollSeveranceService,
    PayrollTaxService,
    PayrollTaxCalculatorService,
    PayrollTaxReportService,
    PayrollSourcePreviewService,
    PayrollCalculationVerificationService,
    PayrollProgressService,
  ],
})
export class PayrollModule {}
