/*
 * จับคู่ "วันหยุดที่ให้เพิ่ม" ให้กลายเป็นใบสลับวันหยุดจริง
 *
 * ไฟล์ระบบเดิมไม่ได้บอกว่าวันไหนสลับกับวันไหน บอกแค่ว่าวันนี้เป็นวันทำงาน
 * และวันนั้นเป็นวันหยุดของพนักงานคนนี้ ตอนนำเข้าจึงลงเป็น "ให้วันหยุดเพิ่ม"
 * (holiday_swaps ที่ originalHolidayDate ว่าง) ทำให้พนักงานได้วันหยุดสองวัน
 * คือวันหยุดประจำสัปดาห์เดิม + วันที่ให้เพิ่ม แล้ววันที่เขามาทำงานจริงกลับ
 * ถูกนับเป็น "ทำงานในวันหยุด"
 *
 * สคริปต์นี้จับคู่ให้: วันที่ไฟล์บอกว่าเป็นวันทำงาน แต่ระบบเห็นเป็นวันหยุด
 * จับกับวันหยุดที่ให้เพิ่มของคนเดียวกันที่อยู่ใกล้กันไม่เกิน 10 วัน
 * แล้วเซ็ต originalHolidayDate ให้ครบคู่
 *
 *   node scripts/legacy-payroll-import/pair-holiday-swaps.js <from> <to> [--apply]
 */
require('dotenv').config({ quiet: true });
const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('../../dist/generated/prisma/client.js');

const p = new PrismaClient();
const apply = process.argv.includes('--apply');
const DIR = 'd:/NextProject/TJC/HR-Management/docs/ข้อมูลการเข้าออกงานพนักงาน';
const MAX_GAP_DAYS = 10;

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
const parseFileDate = (raw) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};
const daysApart = (a, b) => Math.abs((new Date(a) - new Date(b)) / 86400000);

(async () => {
  const [from, to] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  if (!from || !to) throw new Error('ต้องระบุช่วงวันที่ เช่น 2026-07-26 2026-09-25');

  /* 1. อ่านจากไฟล์ว่าวันไหนระบบเดิมถือเป็นวันทำงาน */
  const fileWork = new Set();
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
      const d = parseFileDate(c2);
      if (!d || !cur) return;
      if (txt(row.getCell(3).value) === 'วันทำงาน') fileWork.add(`${cur}|${d}`);
    });
  }

  /* 2. วันที่ระบบเห็นเป็นวันหยุด แต่ไฟล์บอกว่าเป็นวันทำงาน */
  const rows = await p.$queryRawUnsafe(
    `SELECT e."employeeCode" code, e.id eid, e."displayName" nm, s."workDate"::text d
     FROM attendance_daily_summaries s JOIN employees e ON e.id=s."employeeId"
     WHERE s."workDate" BETWEEN $1::date AND $2::date
       AND COALESCE((s."policySnapshot" -> 'holiday' ->> 'isHoliday')::boolean,false) = true
     ORDER BY 1,4`, from, to);
  const mismatched = rows.filter((r) => fileWork.has(`${r.code}|${r.d}`));
  console.log('วันที่ระบบเห็นเป็นวันหยุด แต่ไฟล์บอกว่าเป็นวันทำงาน:', mismatched.length);

  /* 3. วันหยุดที่ให้เพิ่มไว้ ยังไม่จับคู่ */
  const extras = await p.$queryRawUnsafe(
    `SELECT h.id, h."scopeId" eid, h."swappedHolidayDate"::text d
     FROM holiday_swaps h
     WHERE h."deletedAt" IS NULL AND h.status='ACTIVE' AND h."scopeType"='EMPLOYEE'
       AND h."originalHolidayDate" IS NULL
       AND h."swappedHolidayDate" BETWEEN $1::date AND $2::date`, from, to);
  const byEmp = new Map();
  for (const x of extras) {
    if (!byEmp.has(x.eid)) byEmp.set(x.eid, []);
    byEmp.get(x.eid).push(x);
  }

  const used = new Set();
  const pairs = [];
  const unpaired = [];
  for (const m of mismatched) {
    const cands = (byEmp.get(m.eid) || [])
      .filter((x) => !used.has(x.id))
      .sort((a, b) => daysApart(a.d, m.d) - daysApart(b.d, m.d));
    if (cands.length && daysApart(cands[0].d, m.d) <= MAX_GAP_DAYS) {
      used.add(cands[0].id);
      pairs.push({ ...m, swapId: cands[0].id, offDay: cands[0].d });
    } else unpaired.push(m);
  }

  console.log('จับคู่ได้ (มาทำงานวันหยุด แล้วไปหยุดวันอื่นแทน):', pairs.length);
  pairs.forEach((x) => console.log(`   ${x.code} ${x.nm} ทำงาน ${x.d} -> หยุดแทน ${x.offDay}`));
  console.log('จับคู่ไม่ได้ (มาทำงานวันหยุดโดยไม่มีวันชดเชย):', unpaired.length);
  unpaired.forEach((x) => console.log(`   ${x.code} ${x.nm} ${x.d}`));

  if (!apply) {
    console.log('\n-- พรีวิวเท่านั้น ใส่ --apply เพื่อเขียนจริง --');
    await p.$disconnect();
    return;
  }

  for (const x of pairs) {
    await p.$executeRawUnsafe(
      `UPDATE holiday_swaps SET "originalHolidayDate"=$1::date, name='สลับวันหยุด', "updatedAt"=NOW() WHERE id=$2`,
      x.d, x.swapId,
    );
  }
  console.log(`\nปรับเป็นใบสลับวันหยุดแล้ว ${pairs.length} ใบ`);
  console.log('ต้องสั่งคำนวณสรุปเวลารายวันของช่วงนี้ใหม่ ยอดถึงจะเปลี่ยน');
  await p.$disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
