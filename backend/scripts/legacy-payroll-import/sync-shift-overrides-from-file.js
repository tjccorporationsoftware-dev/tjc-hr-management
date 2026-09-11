/*
 * ผูกกะรายวันให้ตรงกับคอลัมน์ "กะการทำงาน" ในไฟล์รายงานของระบบเดิม
 *
 * พนักงานบางคนใช้กะไม่เหมือนกันทุกวัน เช่น 680045 เข้า 07:30 จันทร์-ศุกร์
 * แต่วันเสาร์เข้า 08:00 ระบบนี้ผูกกะเป็นช่วงวันที่ จึงต้องทับเป็นรายวัน
 * ตัวเลือกกะเรียง effectiveFrom desc แถวช่วงวันเดียวจึงชนะแถวยาวเสมอ
 *
 * ถ้าไม่ทับ วันเสาร์ของเธอจะถูกคิดสายวันละ 20-26 นาทีทั้งที่มาตรงเวลาตามกะจริง
 *
 *   node scripts/legacy-payroll-import/sync-shift-overrides-from-file.js <from> <to> [--apply]
 */
require('dotenv').config({ quiet: true });
const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { PrismaClient } = require('../../dist/generated/prisma/client.js');

const p = new PrismaClient();
const apply = process.argv.includes('--apply');
const DIR = 'd:/NextProject/TJC/HR-Management/docs/ข้อมูลการเข้าออกงานพนักงาน';
const NOTE = 'ตามกะในไฟล์รายงานตารางเวลาระบบเดิม (ทับรายวัน)';

const txt = (v) => {
  if (v == null) return '';
  if (typeof v === 'object') {
    if (v.text !== undefined) return String(v.text).trim();
    if (v.result !== undefined) return String(v.result).trim();
    if (Array.isArray(v.richText)) return v.richText.map((x) => x.text).join('').trim();
    return '';
  }
  return String(v).trim();
};
const pd = (r) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(r);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};

(async () => {
  const [from, to] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  if (!from || !to) throw new Error('ต้องระบุช่วงวันที่');

  /* 1. อ่านกะรายวันจากไฟล์ */
  const fileShift = new Map();
  for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith('.xlsx'))) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(path.join(DIR, f));
    const ws = wb.worksheets[0];
    let cur = null;
    ws.eachRow((row, i) => {
      if (i <= 2) return;
      const c1 = txt(row.getCell(1).value);
      const c2 = txt(row.getCell(2).value);
      const m = /^([\d]{3,6})\s*:\s*(.+)$/.exec(c1);
      if (m && c1 === c2) { cur = m[1]; return; }
      const d = pd(c2);
      if (!d || !cur || d < from || d > to) return;
      const shift = txt(row.getCell(4).value);
      if (shift) fileShift.set(`${cur}|${d}`, shift);
    });
  }
  console.log('อ่านกะรายวันจากไฟล์', fileShift.size, 'แถว');

  /* 2. กะที่ระบบใช้อยู่ในแต่ละวัน (จากสรุปเวลาที่คำนวณไว้แล้ว) */
  const policies = await p.$queryRawUnsafe(
    `SELECT p.id, p.code,
            (SELECT r."expectedTime" FROM attendance_session_rules r
              WHERE r."policyId"=p.id AND r."sessionCode"='MORNING_IN' AND r."deletedAt" IS NULL LIMIT 1) mstart,
            (SELECT r."expectedTime" FROM attendance_session_rules r
              WHERE r."policyId"=p.id AND r."sessionCode"='CHECK_OUT' AND r."deletedAt" IS NULL LIMIT 1) mend
       FROM attendance_policies p WHERE p."deletedAt" IS NULL AND p.status='ACTIVE'`);
  const policyByLabel = new Map();
  policies.forEach((x) => { if (x.mstart && x.mend) policyByLabel.set(`${x.mstart} - ${x.mend}`, x); });
  console.log('กะที่มีในระบบ:', [...policyByLabel.keys()].join(' · '));

  const summaries = await p.$queryRawUnsafe(
    `SELECT e.id eid, e."employeeCode" code, s."workDate"::text d,
            s."policySnapshot" ->> 'code' pcode
       FROM attendance_daily_summaries s JOIN employees e ON e.id=s."employeeId"
      WHERE s."workDate" BETWEEN $1::date AND $2::date`, from, to);

  const need = [];
  for (const s of summaries) {
    /* วันหยุดไม่มี policySnapshot (ตัวคำนวณจบตั้งแต่รู้ว่าเป็นวันหยุด) เทียบกะไม่ได้ */
    if (!s.pcode) continue;
    const label = fileShift.get(`${s.code}|${s.d}`);
    if (!label) continue;
    const want = policyByLabel.get(label);
    if (!want) continue;
    if (s.pcode === want.code) continue;
    need.push({ ...s, wantId: want.id, wantCode: want.code, label });
  }
  console.log('\nวันที่กะในระบบไม่ตรงกับไฟล์:', need.length);
  const byEmp = {};
  need.forEach((x) => { byEmp[x.code] = (byEmp[x.code] || 0) + 1; });
  Object.entries(byEmp).forEach(([c, n]) => console.log(`  ${c}: ${n} วัน`));
  need.slice(0, 20).forEach((x) => console.log(`     ${x.code} ${x.d} · ระบบ ${x.pcode} -> ไฟล์ ${x.label} (${x.wantCode})`));

  if (!apply) {
    console.log('\n-- พรีวิวเท่านั้น ใส่ --apply เพื่อเขียนจริง --');
    await p.$disconnect();
    return;
  }

  const actor = await p.user.findFirst({ where: { deletedAt: null }, orderBy: { createdAt: 'asc' }, select: { id: true } });
  let made = 0;
  for (const x of need) {
    const dup = await p.$queryRawUnsafe(
      `SELECT id FROM employee_work_shifts
        WHERE "employeeId"=$1 AND "effectiveFrom"=$2::date AND "effectiveTo"=$2::date AND "deletedAt" IS NULL`,
      x.eid, x.d);
    if (dup.length) continue;
    await p.$executeRawUnsafe(
      `INSERT INTO employee_work_shifts (id,"employeeId","policyId","effectiveFrom","effectiveTo",note,status,"assignedById","createdAt","updatedAt")
       VALUES ($1,$2,$3,$4::date,$4::date,$5,'ACTIVE',$6,NOW(),NOW())`,
      randomUUID(), x.eid, x.wantId, x.d, NOTE, actor.id);
    made += 1;
  }
  console.log(`\nผูกกะรายวันเพิ่ม ${made} วัน · ต้องคำนวณสรุปเวลาของช่วงนี้ใหม่`);
  await p.$disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
