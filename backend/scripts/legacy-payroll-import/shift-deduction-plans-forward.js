/*
 * เลื่อนแผนหักรายงวด (กยศ. / กรอ.) ให้เริ่มหักตั้งแต่งวด ส.ค. 2569
 *
 * 7 งวดย้อนหลังยกยอดจากไฟล์ระบบเดิมเป็นรายการเฉพาะงวดครบแล้ว
 * ถ้าปล่อยแผนหักไว้ให้มีผลย้อนหลังด้วย จะหักซ้ำสองทาง (งวด ม.ค. ซ้ำ 14,278 บาท)
 * วันเริ่มเดิมเก็บไว้ในหมายเหตุ ย้อนกลับได้
 */
require('dotenv').config({ quiet: true });
const { PrismaClient } = require('../../dist/generated/prisma/client.js');

const p = new PrismaClient();
const apply = process.argv.includes('--apply');
const NEW = '2026-08-26';

(async () => {
  const rows = await p.employeeDeductionPlan.findMany({
    where: {
      deletedAt: null,
      status: 'ACTIVE',
      startDate: { lt: new Date(`${NEW}T00:00:00.000Z`) },
    },
  });

  const by = {};
  rows.forEach((r) => {
    by[r.code] = (by[r.code] || 0) + 1;
  });
  console.log('แผนหักที่มีผลก่อน', NEW, ':', rows.length, JSON.stringify(by));

  if (!apply) {
    console.log('-- พรีวิวเท่านั้น ใส่ --apply เพื่อเขียนจริง --');
    await p.$disconnect();
    return;
  }

  let n = 0;
  for (const r of rows) {
    const old = r.startDate.toISOString().slice(0, 10);
    const note = (r.note || '').includes('วันเริ่มเดิม')
      ? r.note
      : `${r.note ? `${r.note} · ` : ''}วันเริ่มเดิม ${old} (เลื่อนมาที่ ${NEW} ตอนยกยอด 7 งวดย้อนหลัง)`;

    await p.employeeDeductionPlan.update({
      where: { id: r.id },
      data: { startDate: new Date(`${NEW}T00:00:00.000Z`), note },
    });
    n += 1;
  }

  console.log('เลื่อนแล้ว', n, 'แผน');
  await p.$disconnect();
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
