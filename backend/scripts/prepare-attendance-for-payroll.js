/*
 * พาสรุปเวลารายวันของสาขาหนึ่งกลับเข้าสถานะพร้อมคำนวณเงินเดือน
 *
 * หลังคำนวณเวลาใหม่ วันที่ตัวเลขเปลี่ยนจะถูกตีกลับเป็น "ต้องตรวจ" เสมอ
 * ซึ่งถูกต้องตามการออกแบบ (ตัวเลขเปลี่ยน = ต้องมีคนรับรองใหม่)
 * สคริปต์นี้เดินตามลำดับเดิมของหน้าจอให้ครบ: ตรวจ -> พร้อมจ่าย -> ล็อก
 * เพราะ Payroll ดึงได้เฉพาะวันที่ล็อกหรือส่งเข้างวดแล้วเท่านั้น
 *
 *   node scripts/prepare-attendance-for-payroll.js <dateFrom> <dateTo> <branchId> [note]
 */
require('dotenv').config();
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module.js');
const {
  AttendanceService,
} = require('../dist/modules/attendance/attendance.service.js');
const { PrismaService } = require('../dist/database/prisma.service.js');

const SCOPE = { level: 'GLOBAL', companyId: null, branchId: null };

(async () => {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });

  try {
    const [dateFrom, dateTo, branchId, note] = process.argv.slice(2);

    if (!dateFrom || !dateTo || !branchId) {
      throw new Error('ต้องระบุ dateFrom dateTo และ branchId');
    }

    const service = app.get(AttendanceService);
    const prisma = app.get(PrismaService);

    const actor = await prisma.user.findFirst({
      where: { deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: { id: true, email: true },
    });

    const reason = note ?? 'รับรองหลังคำนวณเวลาใหม่ตามกติกาที่แก้';

    /* 1. วันที่ยังค้างตรวจ — รับรองทีละวันตามทางเดินปกติของหน้าจอ */
    const pending = await prisma.attendanceDailySummary.findMany({
      where: {
        workDate: {
          gte: new Date(`${dateFrom}T00:00:00.000Z`),
          lte: new Date(`${dateTo}T00:00:00.000Z`),
        },
        reviewStatus: { in: ['CALCULATED', 'NEED_REVIEW'] },
        employee: { branchId },
      },
      select: { id: true },
    });

    let reviewed = 0;
    const failures = [];

    for (const summary of pending) {
      try {
        await service.markDailySummaryReviewed(
          summary.id,
          { note: reason },
          actor.id,
          SCOPE,
        );
        reviewed += 1;
      } catch (error) {
        failures.push(`${summary.id}: ${error?.message || error}`);
      }
    }

    console.log('รับรองแล้ว', reviewed, 'วัน', failures.length ? `(พลาด ${failures.length})` : '');
    failures.slice(0, 5).forEach((line) => console.log('  -', line));

    /* 2. พร้อมจ่าย แล้ว 3. ล็อก */
    const ready = await service.monthlyMarkDailySummariesReadyForPayrollByPeriod(
      { dateFrom, dateTo, branchId, issue: 'ALL', note: reason },
      actor.id,
      SCOPE,
    );
    console.log('ตีตราพร้อมจ่าย', ready.updated, 'วัน จากพนักงาน', ready.employeeCount, 'คน');

    const locked = await service.monthlyLockDailySummariesByPeriod(
      { dateFrom, dateTo, branchId, issue: 'ALL', note: reason },
      actor.id,
      SCOPE,
    );
    console.log('ล็อก', locked.updated, 'วัน จากพนักงาน', locked.employeeCount, 'คน');
  } catch (error) {
    console.error('FAIL', error?.message || error);
    process.exitCode = 1;
  } finally {
    await app.close();
  }
})();
