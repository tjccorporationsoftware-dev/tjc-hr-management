/*
 * ล้างใบคำขอที่คนกดสร้างในระบบตอนทดสอบ โดยไม่แตะใบที่นำเข้าจากไฟล์ระบบเดิม
 * และไม่แตะใบที่บันทึกตามคำขอจริงบนเครื่อง production
 *
 * ใช้ก่อนย้ายฐานข้อมูลขึ้นเครื่องจริง จะได้ไม่มีใบทดสอบติดไปด้วย
 *
 * เกณฑ์:
 *   เก็บไว้ — ใบลา/ใบโอทีที่ขึ้นต้น LV-IMP- / OT-IMP-  (นำเข้าจากไฟล์)
 *   เก็บไว้ — ใบแก้เวลา TA-* และใบนอกสถานที่ OS-*      (บันทึกตามใบจริงบน hr.tjc.co.th)
 *   ลบ      — ใบลา LV-* และใบโอที OT-* ที่เหลือ         (คนกดทดสอบในระบบ)
 *
 * ลบลูก ๆ ที่อ้างถึงใบด้วย (ขั้นอนุมัติ ไฟล์แนบ log) ผ่าน cascade ของ Prisma
 * ถ้าตารางไหนไม่ได้ตั้ง cascade จะ error ให้เห็น ไม่ลบทิ้งครึ่ง ๆ เพราะอยู่ใน transaction
 *
 * หลังลบต้องสั่งคำนวณสรุปเวลาของวันที่เกี่ยวข้องใหม่ แล้วปรับยอดวันลาที่ใช้/รออนุมัติ
 * (สคริปต์ทำให้เองตอนท้าย)
 *
 *   node scripts/delete-system-created-requests.js            พรีวิว
 *   node scripts/delete-system-created-requests.js --apply    ลบจริง
 */
require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { PrismaClient } = require('../dist/generated/prisma/client.js');

const p = new PrismaClient();
const apply = process.argv.includes('--apply');
const day = (d) => new Date(d).toISOString().slice(0, 10);

(async () => {
  const leaves = await p.leaveRequest.findMany({
    where: { NOT: { requestNo: { startsWith: 'LV-IMP-' } } },
    include: { employee: { select: { employeeCode: true, displayName: true } }, leaveType: { select: { nameTh: true } } },
    orderBy: { createdAt: 'asc' },
  });
  const overtimes = await p.overtimeRequest.findMany({
    where: { NOT: { requestNo: { startsWith: 'OT-IMP-' } } },
    include: { employee: { select: { employeeCode: true, displayName: true } } },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`=== ใบลาที่จะลบ ${leaves.length} ใบ ===`);
  leaves.forEach((r) => console.log(
    `  ${r.requestNo} · ${r.employee.employeeCode} ${r.employee.displayName ?? '(ไม่มีชื่อ)'} · ${r.leaveType?.nameTh ?? ''} · ${day(r.startDate)} ถึง ${day(r.endDate)} · ${r.totalDays} วัน · ${r.status}`,
  ));
  console.log(`\n=== ใบโอทีที่จะลบ ${overtimes.length} ใบ ===`);
  overtimes.forEach((r) => console.log(
    `  ${r.requestNo} · ${r.employee.employeeCode} ${r.employee.displayName ?? '(ไม่มีชื่อ)'} · ${day(r.workDate)} · ${r.status}`,
  ));

  /* ใบที่บันทึกตามคำขอจริง — แสดงไว้ให้เห็นว่าไม่ได้แตะ */
  const keptTa = await p.timeAdjustRequest.count();
  const keptOs = await p.offsiteWorkRequest.count();
  console.log(`\nไม่แตะ: ใบแก้เวลา ${keptTa} ใบ · ใบนอกสถานที่ ${keptOs} ใบ · ใบลานำเข้า ${await p.leaveRequest.count({ where: { requestNo: { startsWith: 'LV-IMP-' } } })} · ใบโอทีนำเข้า ${await p.overtimeRequest.count({ where: { requestNo: { startsWith: 'OT-IMP-' } } })}`);

  if (!leaves.length && !overtimes.length) { console.log('\nไม่มีอะไรต้องลบ'); await p.$disconnect(); return; }
  if (!apply) { console.log('\n-- พรีวิวเท่านั้น ใส่ --apply เพื่อลบจริง --'); await p.$disconnect(); return; }

  /* สำรองไว้ก่อน เผื่ออยากได้กลับ */
  const backupDir = path.resolve(__dirname, '../../backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const backupFile = path.join(backupDir, `before-delete-system-requests-${day(new Date())}.json`);
  fs.writeFileSync(backupFile, JSON.stringify({ leaves, overtimes }, null, 1));

  const dates = new Set();
  for (const r of leaves) {
    for (const c = new Date(r.startDate); c <= new Date(r.endDate); c.setUTCDate(c.getUTCDate() + 1)) dates.add(day(c));
  }
  overtimes.forEach((r) => dates.add(day(r.workDate)));

  await p.$transaction([
    p.leaveRequest.deleteMany({ where: { id: { in: leaves.map((r) => r.id) } } }),
    p.overtimeRequest.deleteMany({ where: { id: { in: overtimes.map((r) => r.id) } } }),
  ]);
  console.log(`\nลบแล้ว ใบลา ${leaves.length} · ใบโอที ${overtimes.length} · สำรองไว้ที่ ${backupFile}`);

  await p.$disconnect();

  const sorted = [...dates].sort();
  if (sorted.length) {
    console.log(`\nคำนวณสรุปเวลาใหม่ ${sorted[0]} ถึง ${sorted[sorted.length - 1]}`);
    /* recalc ปิด Nest ไม่ทันใน 30 วิ แล้วออกด้วย exit code ไม่เป็นศูนย์ ทั้งที่คำนวณเสร็จแล้ว */
    try {
      execFileSync(process.execPath, ['scripts/recalc-attendance-range.js', sorted[0], sorted[sorted.length - 1]], { stdio: 'ignore' });
    } catch { /* ดูผลจากสรุปเวลาแทน */ }
  }
  console.log('ปรับยอดวันลาที่ใช้ไป/รออนุมัติ');
  execFileSync(process.execPath, ['scripts/reconcile-leave-balance-used-days.js', '--apply', '--year', '2026'], { stdio: 'inherit' });
  process.exit(0);
})().catch((e) => { console.error(e.message || e); process.exit(1); });
