import { BadRequestException } from '@nestjs/common';

import {
  AttendanceReviewStatus,
  PayrollPeriodStatus,
} from '../../../generated/prisma/client';

/**
 * ล็อกงวด — กันไม่ให้เวลาทำงานถูกแก้หลังปิดงวดและจ่ายเงินไปแล้ว
 * -----------------------------------------------------------------------------
 * เดิมตรวจอยู่ในตัว service ของ attendance เท่านั้น เส้นทางอื่นที่เขียนเวลาได้
 * (ลงเวลาเข้า/ออกด้วยตัวเอง, เครื่องสแกน, การอนุมัติคำขอแก้เวลา) จึงไม่ผ่านตัวกันนี้เลย
 * ย้ายมาไว้ตรงกลางเพื่อให้ทุกทางเรียกตัวเดียวกันได้ รวมถึงทางที่ทำงานอยู่ใน transaction
 *
 * รับ client เข้ามาเพื่อให้เรียกจากใน $transaction ได้ ไม่งั้นจะมองไม่เห็น
 * การเปลี่ยนแปลงที่ยังไม่ commit ของตัวเอง
 */

/** เฉพาะเมธอดที่ต้องใช้ รับได้ทั้ง PrismaService และ TransactionClient */
type AttendanceLockClient = {
  attendanceDailySummary: {
    findFirst(args: any): Promise<any>;
  };
  employee: {
    findUnique(args: any): Promise<any>;
  };
  payrollPeriod: {
    findFirst(args: any): Promise<any>;
  };
};

/**
 * วันทำงานนี้ถูกล็อกหรือยัง — คืนเหตุผลเป็นข้อความ หรือ null ถ้าแก้ไขได้
 *
 * ใช้แบบคืนค่าแทนการโยน error เพื่อให้การนำเข้าเป็นชุด (เครื่องสแกน/ไฟล์)
 * ข้ามเฉพาะรายการที่ติดล็อกได้ ไม่ต้องล้มทั้งชุด
 */
export async function checkWorkDateLocked(
  db: AttendanceLockClient,
  employeeId: string,
  workDate: Date,
): Promise<string | null> {
  const summary = await db.attendanceDailySummary.findFirst({
    where: { employeeId, workDate },
    select: {
      lockedAt: true,
      reviewStatus: true,
      payrollRunId: true,
      sentToPayrollAt: true,
    },
  });

  if (summary?.payrollRunId || summary?.sentToPayrollAt) {
    return 'วันนี้ถูกส่งเข้า Payroll แล้ว ไม่สามารถแก้ไขเวลาทำงานได้';
  }

  if (
    summary?.lockedAt ||
    summary?.reviewStatus === AttendanceReviewStatus.LOCKED
  ) {
    return 'วันนี้ปิดงวดและล็อกแล้ว ไม่สามารถแก้ไขเวลาทำงานได้ ต้องปลดล็อกก่อน';
  }

  /*
   * ไม่มีแถวสรุปรายวัน ไม่ได้แปลว่าแก้ได้เสรี
   *
   * วันที่พนักงานไม่มาและไม่มีใครกดคำนวณ จะไม่มีแถวสรุปเลย เดิมจึงหลุดออกไป
   * ทั้งที่งวดเงินเดือนปิดและจ่ายเงินไปแล้ว — ใส่เวลาย้อนเข้าไปได้
   * แล้วถ้ามีใครกดคำนวณใหม่ ตัวเลขจะเปลี่ยนหลังจ่ายเงินโดยไม่มีร่องรอย
   */
  const employee = await db.employee.findUnique({
    where: { id: employeeId },
    select: { companyId: true },
  });

  if (!employee) return null;

  const lockedPeriod = await db.payrollPeriod.findFirst({
    where: {
      companyId: employee.companyId,
      deletedAt: null,
      cancelledAt: null,
      startDate: { lte: workDate },
      endDate: { gte: workDate },
      OR: [
        { lockedAt: { not: null } },
        { closedAt: { not: null } },
        {
          status: {
            in: [PayrollPeriodStatus.LOCKED, PayrollPeriodStatus.CLOSED],
          },
        },
      ],
    },
    select: { name: true },
  });

  if (lockedPeriod) {
    return `วันนี้อยู่ในงวดเงินเดือน "${lockedPeriod.name}" ที่ปิดไปแล้ว ไม่สามารถแก้ไขเวลาทำงานได้`;
  }

  return null;
}

/** เหมือน checkWorkDateLocked แต่โยน error ทันทีเมื่อถูกล็อก */
export async function assertWorkDateNotLocked(
  db: AttendanceLockClient,
  employeeId: string,
  workDate: Date,
) {
  const reason = await checkWorkDateLocked(db, employeeId, workDate);

  if (reason) {
    throw new BadRequestException(reason);
  }
}

/**
 * เวอร์ชันช่วงวันที่ — ใช้กับใบลา/ใบคำขอที่คร่อมหลายวัน
 *
 * ที่มา: การอนุมัติหรือยกเลิกใบลาในงวดที่ล็อกและคำนวณเงินเดือนแล้ว เคยผ่านได้เฉย ๆ
 * สรุปเวลาที่ล็อกจะไม่ถูกคำนวณตาม (ตัวคำนวณข้ามแถวล็อกเสมอ) ใบลากับเงินเดือน
 * จึงขัดกันเองเงียบ ๆ เช่น ยกเลิกใบลาไม่รับค่าจ้างหลังปิดงวด = เงินที่หักไปแล้ว
 * ไม่มีใบลารองรับ และไม่มีร่องรอยเตือนใครเลย
 *
 * ตรวจแบบ query เดียวต่อชั้น ไม่วนทีละวัน เพื่อให้ใบลายาว ๆ ไม่ช้า
 */
export async function assertDateRangeNotLocked(
  db: AttendanceLockClient & {
    attendanceDailySummary: { findFirst(args: any): Promise<any> };
  },
  employeeId: string,
  startDate: Date,
  endDate: Date,
) {
  const lockedSummary = await db.attendanceDailySummary.findFirst({
    where: {
      employeeId,
      workDate: { gte: startDate, lte: endDate },
      OR: [
        { payrollRunId: { not: null } },
        { sentToPayrollAt: { not: null } },
        { lockedAt: { not: null } },
        { reviewStatus: AttendanceReviewStatus.LOCKED },
        { reviewStatus: AttendanceReviewStatus.SENT_TO_PAYROLL },
      ],
    },
    select: { workDate: true },
  });

  if (lockedSummary) {
    throw new BadRequestException(
      'ช่วงวันที่นี้มีวันที่ปิดงวดหรือส่งเข้าเงินเดือนแล้ว ' +
        'ต้องให้ HR ปลดล็อกงวดและคำนวณใหม่ก่อน จึงจะแก้ไขรายการนี้ได้',
    );
  }

  const employee = await db.employee.findUnique({
    where: { id: employeeId },
    select: { companyId: true },
  });
  if (!employee) return;

  const lockedPeriod = await db.payrollPeriod.findFirst({
    where: {
      companyId: employee.companyId,
      deletedAt: null,
      cancelledAt: null,
      startDate: { lte: endDate },
      endDate: { gte: startDate },
      OR: [
        { lockedAt: { not: null } },
        { closedAt: { not: null } },
        {
          status: {
            in: [PayrollPeriodStatus.LOCKED, PayrollPeriodStatus.CLOSED],
          },
        },
      ],
    },
    select: { name: true },
  });

  if (lockedPeriod) {
    throw new BadRequestException(
      `ช่วงวันที่นี้อยู่ในงวดเงินเดือน "${lockedPeriod.name}" ที่ปิดไปแล้ว ` +
        'ต้องให้ HR เปิดงวดก่อน จึงจะแก้ไขรายการนี้ได้',
    );
  }
}
