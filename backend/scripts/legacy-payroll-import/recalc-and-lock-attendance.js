/*
 * คำนวณสรุปเวลารายวันใหม่ทั้ง 7 งวด แล้วรับรอง -> พร้อมจ่าย -> ล็อก ในรอบเดียว
 *
 * ใช้หลังแก้ข้อมูลตั้งต้นที่กระทบยอดเงินในสรุปเวลา (อัตราค่าจ้างย้อนหลัง)
 * เพราะยอดหักลาไม่รับค่าจ้าง/ขาดงาน ถูกคิดเป็นเงินไว้ในสรุปเวลา ไม่ใช่ตอนทำเงินเดือน
 */
require('reflect-metadata');
require('dotenv').config({ quiet: true });
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../../dist/app.module.js');
const {
  AttendanceService,
} = require('../../dist/modules/attendance/attendance.service.js');
const { PrismaService } = require('../../dist/database/prisma.service.js');

const SCOPE = { level: 'GLOBAL', companyId: null, branchId: null };
const COMPANY = 'cmstqxdhf004ttm7wqvoaszwq';
const PERIODS = [
  ['2025-12-26', '2026-01-25'],
  ['2026-01-26', '2026-02-25'],
  ['2026-02-26', '2026-03-25'],
  ['2026-03-26', '2026-04-25'],
  ['2026-04-26', '2026-05-25'],
  ['2026-05-26', '2026-06-25'],
  ['2026-06-26', '2026-07-25'],
];

(async () => {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });
  const svc = app.get(AttendanceService);
  const prisma = app.get(PrismaService);
  const actor = await prisma.user.findFirst({
    where: { deletedAt: null },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  const branches = (
    await prisma.employee.findMany({
      where: { deletedAt: null },
      select: { branchId: true },
      distinct: ['branchId'],
    })
  )
    .map((b) => b.branchId)
    .filter(Boolean);
  const note = 'ยกยอดจากไฟล์ระบบเดิม (นำเข้าย้อนหลัง)';

  for (const [from, to] of PERIODS) {
    const calc = await svc.recalculateDailySummaries(
      { dateFrom: from, dateTo: to, companyId: COMPANY, force: true },
      actor.id,
      SCOPE,
    );

    const pending = await prisma.attendanceDailySummary.findMany({
      where: {
        workDate: {
          gte: new Date(`${from}T00:00:00.000Z`),
          lte: new Date(`${to}T00:00:00.000Z`),
        },
        reviewStatus: { in: ['CALCULATED', 'NEED_REVIEW'] },
      },
      select: { id: true },
    });

    let reviewed = 0;
    for (const s of pending) {
      try {
        await svc.markDailySummaryReviewed(s.id, { note }, actor.id, SCOPE);
        reviewed += 1;
      } catch {
        /* ข้ามแถวที่รับรองไม่ได้ ไปนับตอนท้ายว่าเหลือกี่แถว */
      }
    }

    let locked = 0;
    for (const branchId of branches) {
      await svc.monthlyMarkDailySummariesReadyForPayrollByPeriod(
        { dateFrom: from, dateTo: to, branchId, issue: 'ALL', note },
        actor.id,
        SCOPE,
      );
      const l = await svc.monthlyLockDailySummariesByPeriod(
        { dateFrom: from, dateTo: to, branchId, issue: 'ALL', note },
        actor.id,
        SCOPE,
      );
      locked += l.updated;
    }

    const left = await prisma.attendanceDailySummary.count({
      where: {
        workDate: {
          gte: new Date(`${from}T00:00:00.000Z`),
          lte: new Date(`${to}T00:00:00.000Z`),
        },
        reviewStatus: { notIn: ['LOCKED', 'SENT_TO_PAYROLL'] },
      },
    });

    console.log(
      from,
      '->',
      to,
      '| คำนวณ',
      calc.calculated,
      '| ผิดพลาด',
      calc.errorCount,
      '| รับรอง',
      reviewed,
      '| ล็อก',
      locked,
      '| เหลือ',
      left,
      new Date().toTimeString().slice(0, 8),
    );
  }

  await app.close();
  process.exit(0);
})().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
