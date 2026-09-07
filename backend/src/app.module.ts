import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { validateEnv } from "./config/env.validation";
import { PrismaModule } from "./database/prisma.module";

import { AccessControlModule } from "./modules/access-control/access-control.module";
import { ApprovalsModule } from "./modules/approvals/approvals.module";
import { AttendanceModule } from "./modules/attendance/attendance.module";
import { DataImportModule } from "./modules/data-import/data-import.module";
import { AuditModule } from "./modules/audit/audit.module";
import { AuthModule } from "./modules/auth/auth.module";
import { DashboardModule } from "./modules/dashboard/dashboard.module";
import { DocumentWorkflowModule } from "./modules/document-workflow/document-workflow.module";
import { EmployeesModule } from "./modules/employees/employees.module";
import { EmployeeTransfersModule } from "./modules/employee-transfers/employee-transfers.module";
import { EssModule } from "./modules/ess/ess.module";
import { HealthModule } from "./modules/health/health.module";
import { HrReviewModule } from "./modules/hr-review/hr-review.module";
import { LeavesModule } from "./modules/leaves/leaves.module";
import { ManpowerModule } from "./modules/manpower/manpower.module";
import { ManagerModule } from "./modules/manager/manager.module";
import { MobileModule } from "./modules/mobile/mobile.module";
import { MonitoringModule } from "./modules/monitoring/monitoring.module";
import { OnboardingModule } from "./modules/onboarding/onboarding.module";
import { OffboardingModule } from "./modules/offboarding/offboarding.module";
import { RecruitmentModule } from "./modules/recruitment/recruitment.module";
import { OrganizationModule } from "./modules/organization/organization.module";
import { WithholdingModule } from "./modules/withholding/withholding.module";
import { OvertimeModule } from "./modules/overtime/overtime.module";
import { OffsiteWorkModule } from "./modules/offsite-work/offsite-work.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { PayrollModule } from "./modules/payroll/payroll.module";
import { PerformanceModule } from "./modules/performance/performance.module";
import { ProfileModule } from "./modules/profile/profile.module";
import { ReportsModule } from "./modules/reports/reports.module";
import { SettingsModule } from "./modules/settings/settings.module";
import { TimeAdjustModule } from "./modules/time-adjust/time-adjust.module";
import { TrashModule } from "./modules/trash/trash.module";
import { CompanyDataModule } from "./modules/platform-data/company-data.module";
import { UsersModule } from "./modules/users/users.module";
import { ApprovalWorkflowModule } from './modules/approval-workflow/approval-workflow.module';
import { MaintenanceModule } from './modules/maintenance/maintenance.module';
import { AppQueueRootModule } from "./common/queue/queue.module";
import { LoggerModule } from 'nestjs-pino';
import { buildLoggerConfig } from './common/logging/logger.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),

    // log เป็น JSON พร้อม requestId/userId/companyId ทุกบรรทัด
    LoggerModule.forRoot(buildLoggerConfig()),

    /*
     * คิวงาน — เลือกทางด้วย QUEUE_DRIVER (ดู common/queue/queue.module.ts)
     * ค่าตั้งต้นของ BullMQ ย้ายไปอยู่ที่นั่นทั้งชุด ไม่ได้เปลี่ยนพฤติกรรมทางเดิม
     */
    AppQueueRootModule.forRoot(),

    PrismaModule,

    AuditModule,
    AuthModule,
    AccessControlModule,
    UsersModule,
    OrganizationModule,
    WithholdingModule,
    HealthModule,

    EmployeesModule,
    EmployeeTransfersModule,
    AttendanceModule,
    DataImportModule,
    LeavesModule,
    OvertimeModule,
    OffsiteWorkModule,
    NotificationsModule,
    TimeAdjustModule,
    DocumentWorkflowModule,
    PerformanceModule,
    ManpowerModule,
    ManagerModule,
    OnboardingModule,
    OffboardingModule,
    RecruitmentModule,
    ReportsModule,
    SettingsModule,
    TrashModule,
    CompanyDataModule,
    EssModule,
    ApprovalsModule,
    // มี controller ของตัวเอง (มอบอำนาจอนุมัติแทน) จึงลงทะเบียนที่นี่ด้วย
    ApprovalWorkflowModule,
    // งานตั้งเวลา: สำรองข้อมูล · ล้างไฟล์หมดอายุ · ล้างบันทึกการใช้งาน
    MaintenanceModule,
    MonitoringModule,
    PayrollModule,
    DashboardModule,
    ProfileModule,
    HrReviewModule,
    MobileModule,
  ],
})
export class AppModule {}