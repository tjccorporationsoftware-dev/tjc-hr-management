/*
 * ลบรายการปรับที่สร้างไว้ด้วยเหตุผลที่ระบุ (ใช้ตอนถอยการทดลอง)
 *   node tmp-deladj.js "<reason>" [--apply]
 */
require('dotenv').config({ quiet: true });
const { PrismaClient } = require('../../dist/generated/prisma/client.js');

const p = new PrismaClient();
const apply = process.argv.includes('--apply');

(async () => {
  const reason = process.argv.slice(2).find((a) => !a.startsWith('--'));
  if (!reason) throw new Error('ต้องระบุเหตุผลของรายการที่จะลบ');

  const count = await p.payrollAdjustment.count({ where: { reason } });
  console.log('พบ', count, 'รายการ ที่เหตุผล =', reason);

  if (!apply) {
    console.log('-- พรีวิวเท่านั้น ใส่ --apply เพื่อลบจริง --');
    await p.$disconnect();
    return;
  }

  const n = await p.payrollAdjustment.deleteMany({ where: { reason } });
  console.log('ลบแล้ว', n.count);
  await p.$disconnect();
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
