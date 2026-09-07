/*
 * ตีตรา "พร้อมส่งเงินเดือน" ให้สรุปเวลารายวันทั้งช่วง
 *
 * ใช้คู่กับการคำนวณเวลาใหม่ เพราะการคำนวณใหม่จะรีเซ็ตสถานะกลับเป็น
 * "คำนวณแล้ว" ทำให้ Payroll ตีกลับว่ายังมีวันที่ยังไม่ผ่านการตรวจ
 *
 *   node scripts/mark-attendance-ready-for-payroll.js <dateFrom> <dateTo> [branchId]
 */
require('dotenv').config();
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module.js');
const {
  AttendanceService,
} = require('../dist/modules/attendance/attendance.service.js');
const { PrismaService } = require('../dist/database/prisma.service.js');

(async () => {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });

  try {
    const [dateFrom, dateTo, branchId] = process.argv.slice(2);
    const service = app.get(AttendanceService);
    const prisma = app.get(PrismaService);

    const actor = await prisma.user.findFirst({
      where: { deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: { id: true, email: true },
    });

    const result = await service.monthlyMarkDailySummariesReadyForPayrollByPeriod(
      {
        dateFrom,
        dateTo,
        branchId,
        issue: 'ALL',
        note: 'ตีตราพร้อมส่งเงินเดือนหลังคำนวณเวลาใหม่',
      },
      actor.id,
      { level: 'GLOBAL', companyId: null, branchId: null },
    );

    console.log(JSON.stringify(result, null, 2).slice(0, 600));
  } catch (error) {
    console.error('FAIL', error?.message || error);
    process.exitCode = 1;
  } finally {
    await app.close();
  }
})();
