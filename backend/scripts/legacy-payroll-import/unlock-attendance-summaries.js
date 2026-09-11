/*
 * ปลดล็อกสรุปเวลารายวันของช่วงที่ระบุ กลับเป็นสถานะ "คำนวณแล้ว"
 *
 * ต้องใช้ตอนที่ข้อมูลตั้งต้นเปลี่ยนหลังล็อกไปแล้ว — รอบนี้คือสร้างประวัติค่าจ้าง
 * ย้อนหลัง ทำให้ยอดหักลาไม่รับค่าจ้าง/ขาดงานที่คิดไว้ด้วยอัตราปัจจุบันสูงเกินจริง
 * ตัวคำนวณข้ามแถวที่ล็อกไว้เสมอ จึงต้องปลดก่อนแล้วค่อยคำนวณใหม่และล็อกกลับ
 *
 * ไม่แตะแถวที่ส่งเข้างวดเงินเดือนไปแล้วจริง ๆ (sentToPayrollAt / payrollRunId)
 *
 *   node tmp-unlock.js <from> <to> [--apply]
 */
require('dotenv').config({ quiet: true });
const { PrismaClient } = require('../../dist/generated/prisma/client.js');

const p = new PrismaClient();
const apply = process.argv.includes('--apply');

(async () => {
  const [from, to] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  if (!from || !to) throw new Error('ต้องระบุช่วงวันที่');

  /*
   * รวมแถวที่ถูกงวดเงินเดือนดึงไปแล้วด้วย — งวดทั้ง 7 จะถูกสั่งคำนวณใหม่หลังจากนี้
   * แล้วมันจะดึงกลับไปเองตามเดิม (markAttendanceSummariesSentToPayroll)
   */
  const where = {
    workDate: {
      gte: new Date(`${from}T00:00:00.000Z`),
      lte: new Date(`${to}T00:00:00.000Z`),
    },
    reviewStatus: { in: ['LOCKED', 'SENT_TO_PAYROLL', 'READY_FOR_PAYROLL'] },
  };

  const count = await p.attendanceDailySummary.count({ where });
  console.log('แถวที่ล็อกอยู่และปลดได้', count);

  if (!apply) {
    console.log('-- พรีวิวเท่านั้น ใส่ --apply เพื่อเขียนจริง --');
    await p.$disconnect();
    return;
  }

  const n = await p.attendanceDailySummary.updateMany({
    where,
    data: {
      reviewStatus: 'CALCULATED',
      lockedAt: null,
      lockedById: null,
      readyForPayrollAt: null,
      readyForPayrollById: null,
      sentToPayrollAt: null,
      sentToPayrollById: null,
      payrollRunId: null,
      payrollPeriodId: null,
    },
  });
  console.log('ปลดล็อกแล้ว', n.count, 'แถว');
  await p.$disconnect();
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
