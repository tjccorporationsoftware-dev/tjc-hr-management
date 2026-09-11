/*
 * ล้างการแจ้งเตือนในกระดิ่งของผู้ใช้ทุกคน
 *
 * ใช้ตอนเตรียมระบบก่อนเปิดใช้จริง เพราะการแจ้งเตือนที่สะสมมาระหว่างนำเข้าข้อมูล
 * ย้อนหลัง (อนุมัติใบลา/โอที/เงินเดือนหลายร้อยรายการ) ไม่มีความหมายกับผู้ใช้
 *
 * ลบถาวร ไม่มี soft delete — ตาราง Notification ไม่มีคอลัมน์ deletedAt
 *
 *   node scripts/clear-all-notifications.js            พรีวิว
 *   node scripts/clear-all-notifications.js --apply    ลบจริง
 */
require('dotenv').config({ quiet: true });
const { PrismaClient } = require('../dist/generated/prisma/client.js');

const p = new PrismaClient();
const apply = process.argv.includes('--apply');

(async () => {
  const total = await p.notification.count();
  const users = await p.notification.groupBy({ by: ['userId'] });
  console.log(`การแจ้งเตือนทั้งหมด ${total} รายการ ของผู้ใช้ ${users.length} คน`);

  if (!apply) {
    console.log('\n-- พรีวิวเท่านั้น ใส่ --apply เพื่อลบจริง --');
    await p.$disconnect();
    return;
  }

  const { count } = await p.notification.deleteMany({});
  console.log(`ลบแล้ว ${count} รายการ · เหลือ ${await p.notification.count()}`);
  await p.$disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
