import { Module } from "@nestjs/common";

import { PrismaModule } from "../../database/prisma.module";
import { LeavesModule } from "../leaves/leaves.module";
import { OvertimeModule } from "../overtime/overtime.module";
import { TimeAdjustModule } from "../time-adjust/time-adjust.module";
import { OffsiteWorkModule } from "../offsite-work/offsite-work.module";
import { DocumentWorkflowModule } from "../document-workflow/document-workflow.module";

import { ApprovalsController } from "./approvals.controller";
import { ApprovalsService } from "./approvals.service";

/**
 * ApprovalsModule
 *
 * เป็น module กลางของ Approval Center
 * ต้อง import module ที่มี service สำหรับ approve/reject จริง ได้แก่:
 * - LeavesModule: ใช้ LeaveRequestsService
 * - OvertimeModule: ใช้ OvertimeRequestsService
 * - TimeAdjustModule: ใช้ TimeAdjustRequestsService
 *
 * หลักการออกแบบ:
 * - ApprovalsService ทำหน้าที่รวมรายการและตรวจสิทธิ์ผู้อนุมัติ
 * - logic การ approve/reject จริงยังอยู่ใน service ของแต่ละ module
 */
@Module({
  imports: [
    PrismaModule,
    LeavesModule,
    OvertimeModule,
    TimeAdjustModule,
    OffsiteWorkModule,
    DocumentWorkflowModule,
  ],
  controllers: [ApprovalsController],
  providers: [ApprovalsService],
  // MobileModule ห่อ service ตัวนี้ต่อ (ADR-001) จึงต้อง export ออกไป
  exports: [ApprovalsService],
})
export class ApprovalsModule {}
