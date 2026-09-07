import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";

import { AuditAction } from "../../generated/prisma/client";
import { Audit } from "../../common/decorators/audit.decorator";
import { Auth } from "../../common/decorators/auth.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { ApprovalsService } from "./approvals.service";
import { ApprovalActionDto } from "./dto/approval-action.dto";
import { ListApprovalRequestsQueryDto } from "./dto/list-approval-requests-query.dto";

/**
 * Payload ของผู้ใช้ที่ดึงมาจาก Auth Guard / CurrentUser decorator
 * ใช้สำหรับระบุตัวตนผู้อนุมัติปัจจุบันว่าเป็น user/employee คนไหน
 */
type CurrentUserPayload = {
  id?: string;
  userId?: string;
  email?: string;
  displayName?: string;
};

/**
 * Approval Center Controller
 *
 * หน้าที่ของไฟล์นี้:
 * - เปิด endpoint กลางสำหรับหน้า Approval Center
 * - รวมคำขออนุมัติจาก Leave / OT / Time Adjust ไว้ใน path เดียว
 * - ไม่ใส่ business logic หนัก ๆ ใน controller ให้ส่งต่อไปที่ ApprovalsService
 *
 * หมายเหตุสำคัญ:
 * - ห้ามเปลี่ยน path ถ้า frontend ใช้อยู่แล้ว
 * - สิทธิ์หน้า Approval Center ถูกเปิดจาก frontend ด้วย APPROVAL_ACCESS หรือสิทธิ์อนุมัติรายโมดูล
 * - service ยังตรวจ scope รายการก่อนแสดง/อนุมัติทุกครั้ง
 */
@Controller("approvals")
@Auth()
export class ApprovalsController {
  constructor(private readonly approvalsService: ApprovalsService) {}

  /**
   * GET /approvals/pending
   *
   * ใช้โหลดรายการในหน้า Approval Center
   * รองรับ query เช่น:
   * - type=ALL | LEAVE | OVERTIME | TIME_ADJUST
   * - status=ALL | SUBMITTED | APPROVED | REJECTED
   * - q=คำค้นหา
   *
   * ถึงชื่อ path จะเป็น pending แต่ปัจจุบัน status=ALL ใช้แสดงประวัติที่อนุมัติ/ไม่อนุมัติแล้วด้วย
   */
  @Get("pending")
  @Audit({
    action: AuditAction.VIEW,
    entity: "ApprovalCenter",
    description: "ดูรายการรออนุมัติใน Approval Center",
  })
  findPendingApprovals(
    @CurrentUser() currentUser: CurrentUserPayload,
    @Query() query: ListApprovalRequestsQueryDto,
  ) {
    return this.approvalsService.findPendingApprovals(currentUser, query);
  }

  /**
   * อนุมัติใบลา ผ่าน Approval Center
   * service จะตรวจ scope ก่อนว่าผู้ใช้ปัจจุบันมีสิทธิ์อนุมัติ step นี้จริงหรือไม่
   */
  @Post("leave/:id/approve")
  @Audit({
    action: AuditAction.APPROVE,
    entity: "ApprovalLeaveRequest",
    description: "อนุมัติใบลาผ่าน Approval Center",
  })
  approveLeaveRequest(
    @CurrentUser() currentUser: CurrentUserPayload,
    @Param("id") id: string,
    @Body() dto: ApprovalActionDto,
  ) {
    return this.approvalsService.approveLeaveRequest(currentUser, id, dto);
  }

  /** ไม่อนุมัติใบลา ผ่าน Approval Center */
  @Post("leave/:id/reject")
  @Audit({
    action: AuditAction.REJECT,
    entity: "ApprovalLeaveRequest",
    description: "ไม่อนุมัติใบลาผ่าน Approval Center",
  })
  rejectLeaveRequest(
    @CurrentUser() currentUser: CurrentUserPayload,
    @Param("id") id: string,
    @Body() dto: ApprovalActionDto,
  ) {
    return this.approvalsService.rejectLeaveRequest(currentUser, id, dto);
  }

  /** ส่งกลับใบลาให้ผู้ยื่นตรวจสอบ/แก้ไข แล้วส่งมาใหม่ */
  @Post("leave/:id/return")
  @Audit({
    action: AuditAction.UPDATE,
    entity: "ApprovalLeaveRequest",
    description: "ส่งกลับใบลาให้ตรวจสอบใหม่ผ่าน Approval Center",
  })
  returnLeaveRequest(
    @CurrentUser() currentUser: CurrentUserPayload,
    @Param("id") id: string,
    @Body() dto: ApprovalActionDto,
  ) {
    return this.approvalsService.returnLeaveRequest(currentUser, id, dto);
  }

  /** อนุมัติคำขอ OT ผ่าน Approval Center */
  @Post("overtime/:id/approve")
  @Audit({
    action: AuditAction.APPROVE,
    entity: "ApprovalOvertimeRequest",
    description: "อนุมัติคำขอ OT ผ่าน Approval Center",
  })
  approveOvertimeRequest(
    @CurrentUser() currentUser: CurrentUserPayload,
    @Param("id") id: string,
    @Body() dto: ApprovalActionDto,
  ) {
    return this.approvalsService.approveOvertimeRequest(currentUser, id, dto);
  }

  /** ไม่อนุมัติคำขอ OT ผ่าน Approval Center */
  @Post("overtime/:id/reject")
  @Audit({
    action: AuditAction.REJECT,
    entity: "ApprovalOvertimeRequest",
    description: "ไม่อนุมัติคำขอ OT ผ่าน Approval Center",
  })
  rejectOvertimeRequest(
    @CurrentUser() currentUser: CurrentUserPayload,
    @Param("id") id: string,
    @Body() dto: ApprovalActionDto,
  ) {
    return this.approvalsService.rejectOvertimeRequest(currentUser, id, dto);
  }

  /** ส่งกลับคำขอ OT ให้ผู้ยื่นตรวจสอบ/แก้ไข แล้วส่งมาใหม่ */
  @Post("overtime/:id/return")
  @Audit({
    action: AuditAction.UPDATE,
    entity: "ApprovalOvertimeRequest",
    description: "ส่งกลับคำขอ OT ให้ตรวจสอบใหม่ผ่าน Approval Center",
  })
  returnOvertimeRequest(
    @CurrentUser() currentUser: CurrentUserPayload,
    @Param("id") id: string,
    @Body() dto: ApprovalActionDto,
  ) {
    return this.approvalsService.returnOvertimeRequest(currentUser, id, dto);
  }

  /** อนุมัติคำขอแก้เวลา ผ่าน Approval Center */
  @Post("time-adjust/:id/approve")
  @Audit({
    action: AuditAction.APPROVE,
    entity: "ApprovalTimeAdjustRequest",
    description: "อนุมัติคำขอแก้เวลาผ่าน Approval Center",
  })
  approveTimeAdjustRequest(
    @CurrentUser() currentUser: CurrentUserPayload,
    @Param("id") id: string,
    @Body() dto: ApprovalActionDto,
  ) {
    return this.approvalsService.approveTimeAdjustRequest(currentUser, id, dto);
  }

  /** ไม่อนุมัติคำขอแก้เวลา ผ่าน Approval Center */
  @Post("time-adjust/:id/reject")
  @Audit({
    action: AuditAction.REJECT,
    entity: "ApprovalTimeAdjustRequest",
    description: "ไม่อนุมัติคำขอแก้เวลาผ่าน Approval Center",
  })
  rejectTimeAdjustRequest(
    @CurrentUser() currentUser: CurrentUserPayload,
    @Param("id") id: string,
    @Body() dto: ApprovalActionDto,
  ) {
    return this.approvalsService.rejectTimeAdjustRequest(currentUser, id, dto);
  }

  /** ส่งกลับคำขอแก้เวลาให้ผู้ยื่นตรวจสอบ/แก้ไข แล้วส่งมาใหม่ */
  @Post("time-adjust/:id/return")
  @Audit({
    action: AuditAction.UPDATE,
    entity: "ApprovalTimeAdjustRequest",
    description: "ส่งกลับคำขอแก้เวลาให้ตรวจสอบใหม่ผ่าน Approval Center",
  })
  returnTimeAdjustRequest(
    @CurrentUser() currentUser: CurrentUserPayload,
    @Param("id") id: string,
    @Body() dto: ApprovalActionDto,
  ) {
    return this.approvalsService.returnTimeAdjustRequest(currentUser, id, dto);
  }

  /** อนุมัติคำขอทำงานนอกสถานที่ ผ่าน Approval Center */
  @Post("offsite/:id/approve")
  @Audit({
    action: AuditAction.APPROVE,
    entity: "ApprovalOffsiteWorkRequest",
    description: "อนุมัติคำขอทำงานนอกสถานที่ผ่าน Approval Center",
  })
  approveOffsiteRequest(
    @CurrentUser() currentUser: CurrentUserPayload,
    @Param("id") id: string,
    @Body() dto: ApprovalActionDto,
  ) {
    return this.approvalsService.approveOffsiteRequest(currentUser, id, dto);
  }

  /** ไม่อนุมัติคำขอทำงานนอกสถานที่ ผ่าน Approval Center */
  @Post("offsite/:id/reject")
  @Audit({
    action: AuditAction.REJECT,
    entity: "ApprovalOffsiteWorkRequest",
    description: "ไม่อนุมัติคำขอทำงานนอกสถานที่ผ่าน Approval Center",
  })
  rejectOffsiteRequest(
    @CurrentUser() currentUser: CurrentUserPayload,
    @Param("id") id: string,
    @Body() dto: ApprovalActionDto,
  ) {
    return this.approvalsService.rejectOffsiteRequest(currentUser, id, dto);
  }

  /** ส่งกลับคำขอทำงานนอกสถานที่ให้ผู้ยื่นตรวจสอบ/แก้ไข แล้วส่งมาใหม่ */
  @Post("offsite/:id/return")
  @Audit({
    action: AuditAction.UPDATE,
    entity: "ApprovalOffsiteWorkRequest",
    description: "ส่งกลับคำขอทำงานนอกสถานที่ให้ตรวจสอบใหม่ผ่าน Approval Center",
  })
  returnOffsiteRequest(
    @CurrentUser() currentUser: CurrentUserPayload,
    @Param("id") id: string,
    @Body() dto: ApprovalActionDto,
  ) {
    return this.approvalsService.returnOffsiteRequest(currentUser, id, dto);
  }

  /** อนุมัติคำขอเอกสาร ผ่าน Approval Center */
  @Post("document/:id/approve")
  @Audit({
    action: AuditAction.APPROVE,
    entity: "ApprovalDocumentRequest",
    description: "อนุมัติคำขอเอกสารผ่าน Approval Center",
  })
  approveDocumentRequest(
    @CurrentUser() currentUser: CurrentUserPayload,
    @Param("id") id: string,
    @Body() dto: ApprovalActionDto,
  ) {
    return this.approvalsService.approveDocumentRequest(currentUser, id, dto);
  }

  /** ไม่อนุมัติคำขอเอกสาร ผ่าน Approval Center */
  @Post("document/:id/reject")
  @Audit({
    action: AuditAction.REJECT,
    entity: "ApprovalDocumentRequest",
    description: "ไม่อนุมัติคำขอเอกสารผ่าน Approval Center",
  })
  rejectDocumentRequest(
    @CurrentUser() currentUser: CurrentUserPayload,
    @Param("id") id: string,
    @Body() dto: ApprovalActionDto,
  ) {
    return this.approvalsService.rejectDocumentRequest(currentUser, id, dto);
  }

  /** ส่งกลับคำขอเอกสารให้ผู้ยื่นตรวจสอบ/แก้ไข แล้วส่งมาใหม่ */
  @Post("document/:id/return")
  @Audit({
    action: AuditAction.UPDATE,
    entity: "ApprovalDocumentRequest",
    description: "ส่งกลับคำขอเอกสารให้ตรวจสอบใหม่ผ่าน Approval Center",
  })
  returnDocumentRequest(
    @CurrentUser() currentUser: CurrentUserPayload,
    @Param("id") id: string,
    @Body() dto: ApprovalActionDto,
  ) {
    return this.approvalsService.returnDocumentRequest(currentUser, id, dto);
  }
}
