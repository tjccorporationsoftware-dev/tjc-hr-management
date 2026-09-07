import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { AuditAction } from '../../generated/prisma/client';
import { Audit } from '../../common/decorators/audit.decorator';
import { Auth } from '../../common/decorators/auth.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { HrReviewActionDto } from './dto/hr-review-action.dto';
import { ListHrReviewItemsQueryDto } from './dto/list-hr-review-items-query.dto';
import { HrReviewService } from './hr-review.service';
import type { CurrentUserLike } from './types/hr-review.types';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';

/**
 * HR Review Controller
 * --------------------
 * เป็น API สำหรับหน้า HR Review Center / Payroll Handoff
 *
 * หน้าที่ของหน้านี้:
 * - แสดงรายการ Leave / OT / Time Adjust ที่อนุมัติครบแล้ว
 * - ให้ HR ตรวจสอบก่อนส่งเข้าเงินเดือน
 * - ทำเครื่องหมายว่าพร้อมเข้า Payroll หรือส่งเข้า Payroll แล้ว
 *
 * สำคัญ:
 * - ไม่แทนที่ Approval Center เดิม
 * - ไม่เปลี่ยนสถานะของ Leave / OT / Time Adjust ต้นทาง
 * - เก็บสถานะการตรวจของ HR ไว้ใน HrReviewItem แยกต่างหาก
 */
@Controller('hr-review')
export class HrReviewController {
  constructor(private readonly hrReviewService: HrReviewService) {}

  @Get()
  @Auth('APPROVAL_ACCESS')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'HrReview',
    description: 'ดูรายการ HR Review / Payroll Handoff',
  })
  findAll(
    @Query() query: ListHrReviewItemsQueryDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.hrReviewService.findAll(query, currentUser.scope);
  }

  @Get(':sourceType/:sourceId')
  @Auth('APPROVAL_ACCESS')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'HrReview',
    description: 'ดูรายละเอียดรายการ HR Review',
  })
  findOne(
    @Param('sourceType') sourceType: string,
    @Param('sourceId') sourceId: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.hrReviewService.findOne(sourceType, sourceId, currentUser.scope);
  }

  @Post(':sourceType/:sourceId/review')
  @Auth('APPROVAL_ACCESS')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'HrReview',
    description: 'HR ตรวจสอบรายการแล้ว',
  })
  markReviewed(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('sourceType') sourceType: string,
    @Param('sourceId') sourceId: string,
    @Body() dto: HrReviewActionDto,
  ) {
    return this.hrReviewService.markReviewed(currentUser, sourceType, sourceId, dto, currentUser.scope);
  }

  @Post(':sourceType/:sourceId/payroll-ready')
  @Auth('APPROVAL_ACCESS')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'HrReview',
    description: 'ทำเครื่องหมายว่ารายการพร้อมเข้าเงินเดือน',
  })
  markPayrollReady(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('sourceType') sourceType: string,
    @Param('sourceId') sourceId: string,
    @Body() dto: HrReviewActionDto,
  ) {
    return this.hrReviewService.markPayrollReady(currentUser, sourceType, sourceId, dto, currentUser.scope);
  }

  @Post(':sourceType/:sourceId/hold')
  @Auth('APPROVAL_ACCESS')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'HrReview',
    description: 'พักรายการ HR Review ไว้ก่อน',
  })
  hold(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('sourceType') sourceType: string,
    @Param('sourceId') sourceId: string,
    @Body() dto: HrReviewActionDto,
  ) {
    return this.hrReviewService.hold(currentUser, sourceType, sourceId, dto, currentUser.scope);
  }

  @Post(':sourceType/:sourceId/sent-to-payroll')
  @Auth('APPROVAL_ACCESS')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'HrReview',
    description: 'ทำเครื่องหมายว่าส่งรายการเข้า Payroll แล้ว',
  })
  markSentToPayroll(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('sourceType') sourceType: string,
    @Param('sourceId') sourceId: string,
    @Body() dto: HrReviewActionDto,
  ) {
    return this.hrReviewService.markSentToPayroll(currentUser, sourceType, sourceId, dto, currentUser.scope);
  }

  @Post(':sourceType/:sourceId/cancel')
  @Auth('APPROVAL_ACCESS')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'HrReview',
    description: 'ยกเลิกสถานะ HR Review ของรายการ',
  })
  cancelReview(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('sourceType') sourceType: string,
    @Param('sourceId') sourceId: string,
    @Body() dto: HrReviewActionDto,
  ) {
    return this.hrReviewService.cancelReview(currentUser, sourceType, sourceId, dto, currentUser.scope);
  }
}
