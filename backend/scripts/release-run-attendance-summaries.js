/*
 * ดึงสรุปเวลารายวันของรอบเงินเดือนกลับมาแก้
 *
 * ตอนคำนวณเงินเดือน ระบบจะจองสรุปเวลารายวันของงวดนั้นไว้ (SENT_TO_PAYROLL)
 * และตอนจ่ายจริงจะล็อกไว้อีกชั้น ทั้งสองสถานะทำให้คำนวณเวลาใหม่ไม่ได้
 * ถ้าต้องแก้กติกาแล้วคิดเวลาใหม่ ต้องปลดออกก่อน แล้วค่อยคำนวณเงินเดือนใหม่
 * ซึ่งจะจองกลับเข้าไปเองตามปกติ
 *
 * ทำได้เฉพาะรอบที่ยังไม่อนุมัติ/ยังไม่จ่าย — ของที่จ่ายไปแล้วต้องแก้ผ่าน
 * ใบปรับปรุงของงวดถัดไป ไม่ใช่ย้อนกลับมาขยับตัวเลขเก่า
 *
 *   node scripts/release-run-attendance-summaries.js <runId> [employeeCode]
 *
 * ใส่รหัสพนักงานต่อท้ายเพื่อปลดเฉพาะคนเดียว ใช้ตอนย้ายคนออกจากสาขาแล้ว
 * วันของเขายังค้างผูกกับรอบของสาขาเดิมอยู่
 */
require('dotenv').config();
const { PrismaClient } = require('../dist/generated/prisma/client.js');

(async () => {
  const prisma = new PrismaClient();

  try {
    const [runId, employeeCode] = process.argv.slice(2);

    if (!runId) {
      throw new Error('ต้องระบุรหัสรอบคำนวณเงินเดือน');
    }

    const run = await prisma.payrollRun.findFirst({
      where: { id: runId, deletedAt: null },
      select: { id: true, status: true },
    });

    if (!run) {
      throw new Error('ไม่พบรอบคำนวณเงินเดือนนี้');
    }

    if (run.status === 'APPROVED' || run.status === 'PAID') {
      throw new Error(
        `รอบนี้สถานะ ${run.status} แล้ว ปลดสรุปเวลาไม่ได้ ต้องแก้ผ่านใบปรับปรุงของงวดถัดไป`,
      );
    }

    const employee = employeeCode
      ? await prisma.employee.findFirst({
          where: { employeeCode, deletedAt: null },
          select: { id: true },
        })
      : null;

    if (employeeCode && !employee) {
      throw new Error(`ไม่พบพนักงานรหัส ${employeeCode}`);
    }

    const result = await prisma.attendanceDailySummary.updateMany({
      where: {
        payrollRunId: runId,
        ...(employee ? { employeeId: employee.id } : {}),
      },
      data: {
        reviewStatus: 'READY_FOR_PAYROLL',
        payrollRunId: null,
        sentToPayrollAt: null,
        sentToPayrollById: null,
        lockedAt: null,
        lockedById: null,
      },
    });

    console.log('ปลดสรุปเวลารายวันกลับมาแก้ได้', result.count, 'วัน');
    console.log('ขั้นถัดไป: คำนวณเวลารายวันใหม่ แล้วคำนวณเงินเดือนของรอบนี้อีกครั้ง');
  } catch (error) {
    console.error('FAIL', error?.message || error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
