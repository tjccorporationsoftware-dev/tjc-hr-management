/*
 * ลบสรุปเวลารายวันที่อยู่นอกช่วงการจ้างและไม่มีข้อมูลอะไรเลย
 *
 * ตัวคำนวณเก็บกวาดแถวนอกช่วงจ้างให้เฉพาะคนที่ยังอยู่ในรายชื่อของรอบคำนวณ
 * คนที่พ้นสภาพ "ก่อน" วันเริ่มช่วงที่คำนวณ จะไม่ถูกหยิบเข้ารายชื่อตั้งแต่แรก
 * แถวเก่าของเขาจึงค้างอยู่ และไปขวางการล็อกงวด (Payroll ต้องล็อกให้ครบทุกแถว)
 *
 * ลบเฉพาะแถวที่ไม่มีรอยตอกบัตร ไม่มีการลา ไม่มียอดหัก และยังไม่ถูกส่งเข้างวดเงินเดือน
 *
 *   node tmp-cleanstale.js [--apply]
 */
require('dotenv').config({ quiet: true });
const { PrismaClient } = require('../../dist/generated/prisma/client.js');

const p = new PrismaClient();
const apply = process.argv.includes('--apply');

(async () => {
  const rows = await p.$queryRawUnsafe(`
    SELECT s.id, e."employeeCode" c, e."displayName" nm, s."workDate"::text d,
           e."startDate"::text sd, e."employmentEndDate"::text ed
    FROM attendance_daily_summaries s JOIN employees e ON e.id=s."employeeId"
    WHERE (s."workDate" < e."startDate"
           OR (e."employmentEndDate" IS NOT NULL AND s."workDate" > e."employmentEndDate"))
      AND s."morningInAt" IS NULL AND s."afternoonInAt" IS NULL AND s."checkOutAt" IS NULL
      AND COALESCE(s."totalDeductionAmount",0) = 0
      AND COALESCE(s."paidLeaveMinutes",0) = 0 AND COALESCE(s."unpaidLeaveMinutes",0) = 0
      AND s."sentToPayrollAt" IS NULL AND s."payrollRunId" IS NULL
    ORDER BY 2,4`);

  console.log('แถวนอกช่วงการจ้างที่ว่างเปล่า:', rows.length);
  rows.slice(0, 15).forEach((r) => console.log(`  ${r.c} ${r.nm} ${r.d} (จ้าง ${r.sd?.slice(0, 10)} – ${r.ed?.slice(0, 10) || '-'})`));

  if (!apply) {
    console.log('-- พรีวิวเท่านั้น ใส่ --apply เพื่อลบจริง --');
    await p.$disconnect();
    return;
  }

  const n = await p.attendanceDailySummary.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
  console.log('ลบแล้ว', n.count, 'แถว');
  await p.$disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
