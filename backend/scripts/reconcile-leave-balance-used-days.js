/*
 * คำนวณ "ใช้ไปแล้ว" และ "รออนุมัติ" ของยอดวันลาใหม่จากใบลาจริง
 *
 *   node scripts/reconcile-leave-balance-used-days.js [--apply] [--year 2026]
 *   ไม่ใส่ --apply = ดูอย่างเดียว
 *
 * ## ที่มา
 * แถวยอดวันลาถูกสร้างพร้อมค่า usedDays = 0 เสมอ ปกติไม่มีปัญหาเพราะแถวถูกสร้าง
 * ตอนพนักงานยื่นใบลาใบแรก ประวัติจึงสะสมต่อกันไปตั้งแต่ต้น
 *
 * แต่ถ้าใบลาถูกนำเข้ามาจากระบบเดิมโดยไม่ผ่านหน้าจอ (ตอนย้ายข้อมูล) จะยังไม่มี
 * แถวยอด พอสร้างยอดทีหลังแล้วเริ่มที่ศูนย์ วันลาที่ใช้ไปแล้วทั้งปีหายเงียบ ๆ
 * พนักงานได้สิทธิ์คืนเต็มจำนวนทั้งที่ลาไปแล้ว
 *
 * โค้ดที่สร้างยอดถูกแก้แล้วให้ดึงประวัติมาใส่ตั้งแต่ตอนสร้าง ไฟล์นี้เก็บกวาดของเดิม
 *
 * ## วิธีคิด
 * ยึดปีตามวันเริ่มลา ให้ตรงกับที่ ensureBalanceForRequest ใช้
 *   ใช้ไปแล้ว  = ผลรวม totalDays ของใบลาสถานะ APPROVED
 *   รออนุมัติ  = ผลรวม totalDays ของใบลาสถานะ SUBMITTED
 * ประเภทที่ตั้งว่าไม่ตัดโควตา (deductQuota = false) ให้เป็นศูนย์ทั้งคู่
 *
 * ไม่แตะ entitlementDays / carriedForwardDays / adjustedDays
 * สามค่านั้นเป็นของนโยบายและของที่ HR ปรับเอง ไม่ใช่ผลจากใบลา
 */

require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');

const { PrismaClient } = require('../dist/generated/prisma/client');

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');
const BACKUP_DIR = path.resolve(__dirname, '../../backups');

function resolveYear() {
  const index = process.argv.indexOf('--year');
  if (index === -1) return null;
  const value = Number(process.argv[index + 1]);
  return Number.isFinite(value) ? value : null;
}

async function main() {
  const year = resolveYear();

  const balances = await prisma.leaveBalance.findMany({
    include: {
      employee: { select: { employeeCode: true } },
      leaveType: { select: { nameTh: true, deductQuota: true } },
    },
    orderBy: [{ employeeId: 'asc' }],
    where: year ? { year } : {},
  });

  console.log('ยอดวันลาที่ตรวจ:', balances.length, 'แถว', year ? `(ปี ${year})` : '(ทุกปี)');

  const changes = [];

  for (const balance of balances) {
    let usedDays = 0;
    let pendingDays = 0;

    if (balance.leaveType.deductQuota !== false) {
      const grouped = await prisma.leaveRequest.groupBy({
        by: ['status'],
        _sum: { totalDays: true },
        where: {
          deletedAt: null,
          employeeId: balance.employeeId,
          leaveTypeId: balance.leaveTypeId,
          status: { in: ['APPROVED', 'SUBMITTED'] },
          startDate: {
            gte: new Date(balance.year, 0, 1),
            lt: new Date(balance.year + 1, 0, 1),
          },
        },
      });

      const pick = (status) =>
        Number(grouped.find((row) => row.status === status)?._sum.totalDays ?? 0);

      usedDays = pick('APPROVED');
      pendingDays = pick('SUBMITTED');
    }

    const currentUsed = Number(balance.usedDays);
    const currentPending = Number(balance.pendingDays);

    if (
      Math.abs(currentUsed - usedDays) > 0.001 ||
      Math.abs(currentPending - pendingDays) > 0.001
    ) {
      changes.push({
        id: balance.id,
        employeeCode: balance.employee.employeeCode,
        leaveTypeName: balance.leaveType.nameTh,
        year: balance.year,
        from: { pendingDays: currentPending, usedDays: currentUsed },
        to: { pendingDays, usedDays },
      });
    }
  }

  console.log('ที่ต้องแก้      :', changes.length, 'แถว');

  if (changes.length === 0) {
    console.log('\nยอดตรงกับใบลาจริงทั้งหมดแล้ว');
    return;
  }

  console.log('');
  for (const change of changes) {
    console.log(
      '  ' +
        change.employeeCode.padEnd(8) +
        String(change.leaveTypeName).padEnd(24) +
        `ใช้ไป ${change.from.usedDays} → ${change.to.usedDays}` +
        (change.from.pendingDays !== change.to.pendingDays
          ? ` · รออนุมัติ ${change.from.pendingDays} → ${change.to.pendingDays}`
          : ''),
    );
  }

  if (!APPLY) {
    console.log('\n(ดูอย่างเดียว — ใส่ --apply เพื่อแก้จริง)');
    return;
  }

  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const backupPath = path.join(
    BACKUP_DIR,
    `before-reconcile-leave-used-days-${changes.length}.json`,
  );
  fs.writeFileSync(backupPath, JSON.stringify(changes, null, 2), 'utf8');
  console.log('\nสำรองค่าเดิมไว้ที่:', backupPath);

  for (const change of changes) {
    await prisma.leaveBalance.update({
      data: { pendingDays: change.to.pendingDays, usedDays: change.to.usedDays },
      where: { id: change.id },
    });
  }

  console.log('\n=== แก้เรียบร้อย ===');
  console.log('  ปรับแล้ว :', changes.length, 'แถว');
}

main()
  .catch((error) => {
    console.error('ล้มเหลว:', error.message.split('\n').slice(0, 6).join('\n'));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
