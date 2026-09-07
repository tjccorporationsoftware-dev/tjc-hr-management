/*
 * คำนวณสรุปเวลารายวันใหม่ทั้งช่วง จากบรรทัดคำสั่ง
 *
 * เรียก service ตัวเดียวกับปุ่ม "คำนวณใหม่" ในหน้าลงเวลา ใช้ตอนแก้กติกา
 * หรือตั้งการยกเว้นแล้วต้องให้ยอดเดิมอัปเดตตาม
 *
 *   node scripts/recalc-attendance-range.js <dateFrom> <dateTo> [companyId]
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
    const [dateFrom, dateTo, companyId] = process.argv.slice(2);
    const service = app.get(AttendanceService);

    /*
     * calculatedById มี foreign key ไปที่ตารางผู้ใช้ ใส่ค่าปลอมแล้วทุกแถวจะเขียนไม่ผ่าน
     * จึงต้องหยิบผู้ใช้จริงมาใช้ และให้เห็นในประวัติว่าใครเป็นคนสั่ง
     */
    const prisma = app.get(PrismaService);
    const actor = await prisma.user.findFirst({
      where: { deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: { id: true, email: true },
    });

    if (!actor) {
      throw new Error('ไม่พบผู้ใช้สำหรับบันทึกประวัติการคำนวณ');
    }

    console.log('คำนวณในนามของ', actor.email);

    const result = await service.recalculateDailySummaries(
      { dateFrom, dateTo, companyId, force: true },
      actor.id,
      { level: 'GLOBAL', companyId: null, branchId: null },
    );

    console.log(JSON.stringify(result, null, 2).slice(0, 800));
  } catch (error) {
    console.error('FAIL', error?.message || error);
    process.exitCode = 1;
  } finally {
    await app.close();
  }
})();
