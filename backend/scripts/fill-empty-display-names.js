/*
 * เติม displayName ให้พนักงานที่ช่องนี้ว่าง = "คำนำหน้า ชื่อ นามสกุล"
 *
 * ปกติระบบตั้งให้ตอนสร้าง แต่มี 2 คนที่หลุดมาว่าง (680020, 690034) ทำให้ชื่อหาย
 * ในบางจุดที่อ่านคอลัมน์นี้ตรง ๆ (ประวัติการใช้งาน, สลิป) และตัวต่อชื่อเล่นหน้าเว็บ
 * ก็ข้ามคนที่ไม่มี displayName
 *
 *   node scripts/fill-empty-display-names.js            พรีวิว
 *   node scripts/fill-empty-display-names.js --apply
 */
require('dotenv').config({ quiet: true });
const { PrismaClient } = require('../dist/generated/prisma/client.js');

const p = new PrismaClient();
const apply = process.argv.includes('--apply');

(async () => {
  const rows = await p.employee.findMany({
    where: { deletedAt: null, OR: [{ displayName: null }, { displayName: '' }] },
    select: { id: true, employeeCode: true, title: true, firstName: true, lastName: true },
  });
  console.log(`displayName ว่าง ${rows.length} คน`);
  for (const r of rows) {
    const name = [r.title, r.firstName, r.lastName].filter(Boolean).join(' ').trim();
    console.log(`  ${r.employeeCode} -> ${name}`);
    if (apply && name) await p.employee.update({ where: { id: r.id }, data: { displayName: name } });
  }
  console.log(apply ? 'เขียนแล้ว' : '-- พรีวิว ใส่ --apply เพื่อเขียนจริง --');
  await p.$disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
