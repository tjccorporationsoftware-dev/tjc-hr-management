import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';

/**
 * PayrollHandoffReadinessService
 * ------------------------------
 * Service สำหรับอ่านภาพรวมรายการ HR Review ที่พร้อมเข้า Payroll
 *
 * ใช้สำหรับหน้า dashboard / ปุ่มแจ้งเตือน / ตรวจสอบก่อนคำนวณเงินเดือน
 * ไม่ได้สร้าง PayrollLine จริง หน้าที่สร้าง line อยู่ที่ PayrollHandoffImportService
 */
@Injectable()
export class PayrollHandoffReadinessService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * นับจำนวนรายการที่ HR กด PAYROLL_READY แยกตาม sourceType
   */
  async countReadyItems(params: {
    companyId?: string;
    periodId?: string;
    payrollRunId?: string;
  }) {
    const where: Record<string, unknown> = {
      status: 'PAYROLL_READY',
    };

    if (params.companyId) where.companyId = params.companyId;
    if (params.periodId) where.periodId = params.periodId;
    if (params.payrollRunId) where.payrollRunId = params.payrollRunId;

    const prisma = this.prisma as any;

    const [leave, overtime, timeAdjust, total] = await Promise.all([
      prisma.hrReviewItem.count({ where: { ...where, sourceType: 'LEAVE' } }),
      prisma.hrReviewItem.count({ where: { ...where, sourceType: 'OVERTIME' } }),
      prisma.hrReviewItem.count({ where: { ...where, sourceType: 'TIME_ADJUST' } }),
      prisma.hrReviewItem.count({ where }),
    ]);

    return {
      total,
      leave,
      overtime,
      timeAdjust,
    };
  }
}
