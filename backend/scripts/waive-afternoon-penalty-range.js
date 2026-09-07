/*
 * ยกเว้นค่าปรับช่วงบ่ายทั้งช่วงวันที่กำหนด
 *
 * ใช้ตอนฝ่ายบริหารสั่งว่า "งวดนี้ไม่คิดค่าปรับช่วงบ่าย" — ทั้งมาสายบ่าย
 * และลืมสแกนเข้าบ่าย ส่วนงวดอื่นคิดตามปกติ
 *
 * ตั้งธงไว้ที่สรุปเวลารายวัน (ไม่ใช่แก้ยอดตรง ๆ) เพราะธงนี้รอดจากการคำนวณใหม่
 * ตัวคำนวณจะอ่านกลับมาใช้ทุกครั้ง กดคำนวณเวลาซ้ำกี่รอบยอดก็ยังถูก
 *
 *   node scripts/waive-afternoon-penalty-range.js <dateFrom> <dateTo> [--undo]
 *   node scripts/waive-afternoon-penalty-range.js 2026-07-26 2026-08-25
 *
 * ตั้งธงเสร็จแล้วต้องสั่งคำนวณเวลารายวันของช่วงนั้นใหม่ ยอดถึงจะเปลี่ยน
 */
require('dotenv').config();
const { PrismaClient } = require('../dist/generated/prisma/client.js');

const REASON = 'ยกเว้นค่าปรับช่วงบ่ายทั้งงวดตามที่ฝ่ายบริหารสั่ง';

(async () => {
  const prisma = new PrismaClient();

  try {
    const [from, to] = process.argv.slice(2);
    const undo = process.argv.includes('--undo');

    if (!from || !to) {
      throw new Error('ต้องระบุช่วงวันที่ เช่น 2026-07-26 2026-08-25');
    }

    const dateFrom = new Date(`${from}T00:00:00.000Z`);
    const dateTo = new Date(`${to}T00:00:00.000Z`);

    const result = await prisma.attendanceDailySummary.updateMany({
      where: {
        workDate: { gte: dateFrom, lte: dateTo },
        /* แตะเฉพาะแถวที่ยังไม่อยู่ในสถานะที่ต้องการ จะได้บอกจำนวนที่เปลี่ยนจริง */
        afternoonPenaltyWaived: undo,
      },
      data: undo
        ? { afternoonPenaltyWaived: false, afternoonPenaltyWaivedReason: null }
        : { afternoonPenaltyWaived: true, afternoonPenaltyWaivedReason: REASON },
    });

    console.log(
      undo ? 'ยกเลิกการยกเว้น' : 'ตั้งยกเว้นค่าปรับช่วงบ่าย',
      `${from} ถึง ${to}`,
      `${result.count} วัน`,
    );
    console.log('ขั้นถัดไป: สั่งคำนวณเวลารายวันของช่วงนี้ใหม่ แล้วคำนวณเงินเดือนอีกครั้ง');
  } catch (error) {
    console.error('FAIL', error?.message || error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
