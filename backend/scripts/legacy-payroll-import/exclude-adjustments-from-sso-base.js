/*
 * รายการเสริมที่ยกมาจากไฟล์ 7 งวด ไม่ให้เข้าฐานประกันสังคม
 *
 * ระบบเดิมคิดประกันสังคม 5% ของ "เงินเดือน" อย่างเดียว ไม่รวมค่าตำแหน่ง
 * เงินพิเศษผู้บริหาร ค่าแรงตกหล่น หรือโอที (พิสูจน์จากไฟล์: 17,000 -> 850,
 * 16,500 -> 825 ทุกคน) ส่วนระบบนี้ตั้งค่าตำแหน่ง/คอมมิชชั่นให้เข้าฐาน
 *
 * แก้ที่ตัวรายการของงวดย้อนหลังเท่านั้น ไม่แตะค่าตั้งต้นของบริษัท
 * (payroll_components) งวด ส.ค. เป็นต้นไปจึงคิดเหมือนเดิมทุกอย่าง
 */
require('dotenv').config({ quiet: true });
const { PrismaClient } = require('../../dist/generated/prisma/client.js');

const p = new PrismaClient();
const apply = process.argv.includes('--apply');
const REASON_PREFIX = 'นำเข้าจากรายงานผลการคำนวณเงินเดือนสุทธิ 2026-0';

(async () => {
  const where = {
    reason: { startsWith: REASON_PREFIX },
    isSocialSecurityBase: true,
  };

  const rows = await p.payrollAdjustment.groupBy({
    by: ['code'],
    where,
    _count: true,
    _sum: { amount: true },
  });

  console.log('รายการที่ยังเข้าฐานประกันสังคมอยู่:');
  rows.forEach((r) =>
    console.log('  ', r.code, r._count, Number(r._sum.amount)),
  );

  if (!apply) {
    console.log('-- พรีวิวเท่านั้น ใส่ --apply เพื่อเขียนจริง --');
    await p.$disconnect();
    return;
  }

  const n = await p.payrollAdjustment.updateMany({
    where,
    data: { isSocialSecurityBase: false },
  });
  console.log('ปรับแล้ว', n.count, 'รายการ');
  await p.$disconnect();
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
