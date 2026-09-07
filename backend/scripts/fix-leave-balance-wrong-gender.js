/*
 * ลบยอดวันลาที่ถูกสร้างให้พนักงานที่ยื่นประเภทนั้นไม่ได้เพราะข้อจำกัดเรื่องเพศ
 *
 *   node scripts/fix-leave-balance-wrong-gender.js [--apply]
 *   ไม่ใส่ --apply = ดูอย่างเดียว
 *
 * ## ที่มา
 * genderEligibility ถูกตรวจแค่ตอน "ยื่นใบลา" ไม่ได้ตรวจตอน "สร้างยอด"
 * พนักงานชายจึงมีโควตาลาคลอด 60 วัน และพนักงานหญิงมีโควตาลาอุปสมบท
 * ยอดพวกนี้ยื่นจริงไม่ได้ (assertEligible ปฏิเสธ) แต่ไปโป่งอยู่ในยอดรวม
 * ทำให้ HR อ่านตัวเลข "วันลาคงเหลือทั้งบริษัท" ผิด
 *
 * โค้ดที่สร้างยอดถูกแก้แล้วให้ข้ามประเภทที่เพศไม่ตรง ไฟล์นี้เก็บกวาดของเดิม
 *
 * ## กันพลาด
 * ลบเฉพาะแถวที่ยังไม่มีการใช้งานจริง — ใช้ไป 0 · รออนุมัติ 0 · ไม่เคยปรับเอง
 * ถ้าแถวไหนมีตัวเลขอยู่ แปลว่าเคยมีการลาจริงหรือ HR เคยปรับไว้ จะข้ามและรายงาน
 * ให้คนตัดสินใจเอง ไม่ลบข้อมูลที่มีร่องรอยการใช้งานทิ้งเงียบ ๆ
 */

require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');

const { PrismaClient } = require('../dist/generated/prisma/client');

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');
const BACKUP_DIR = path.resolve(__dirname, '../../backups');

async function main() {
  const balances = await prisma.leaveBalance.findMany({
    include: {
      employee: {
        select: {
          employeeCode: true,
          displayName: true,
          profile: { select: { gender: true } },
        },
      },
      leaveType: { select: { nameTh: true, genderEligibility: true } },
    },
  });

  const mismatched = balances.filter((row) => {
    if (row.leaveType.genderEligibility === 'ALL') return false;
    return row.employee.profile?.gender !== row.leaveType.genderEligibility;
  });

  console.log('ยอดวันลาทั้งหมด        :', balances.length);
  console.log('เพศไม่ตรงกับประเภทลา   :', mismatched.length);

  if (mismatched.length === 0) {
    console.log('\nไม่มีอะไรต้องแก้');
    return;
  }

  const untouched = mismatched.filter(
    (row) =>
      Number(row.usedDays) === 0 &&
      Number(row.pendingDays) === 0 &&
      Number(row.adjustedDays) === 0,
  );
  const inUse = mismatched.filter((row) => !untouched.includes(row));

  console.log('  ลบได้ (ไม่เคยใช้งาน) :', untouched.length);
  console.log('  ต้องดูเอง (มีร่องรอย):', inUse.length);

  if (inUse.length > 0) {
    console.log('\nแถวที่ข้ามไว้ให้ตัดสินใจเอง:');
    for (const row of inUse) {
      console.log(
        '  ',
        row.employee.employeeCode,
        row.leaveType.nameTh,
        `ใช้ไป ${row.usedDays} · รออนุมัติ ${row.pendingDays} · ปรับเอง ${row.adjustedDays}`,
      );
    }
  }

  const byType = untouched.reduce((acc, row) => {
    acc[row.leaveType.nameTh] = (acc[row.leaveType.nameTh] ?? 0) + 1;
    return acc;
  }, {});

  console.log('\nที่จะลบ แยกตามประเภท:');
  for (const [name, count] of Object.entries(byType)) {
    console.log(`   ${name} : ${count} แถว`);
  }

  if (!APPLY) {
    console.log('\n(ดูอย่างเดียว — ใส่ --apply เพื่อลบจริง)');
    return;
  }

  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const backupPath = path.join(
    BACKUP_DIR,
    `before-fix-leave-balance-gender-${untouched.length}.json`,
  );
  fs.writeFileSync(backupPath, JSON.stringify(mismatched, null, 2), 'utf8');
  console.log('\nสำรองแถวเดิมไว้ที่:', backupPath);

  const result = await prisma.leaveBalance.deleteMany({
    where: { id: { in: untouched.map((row) => row.id) } },
  });

  console.log('\n=== ลบเรียบร้อย ===');
  console.log('  ลบแล้ว :', result.count, 'แถว');
}

main()
  .catch((error) => {
    console.error('ล้มเหลว:', error.message.split('\n').slice(0, 6).join('\n'));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
