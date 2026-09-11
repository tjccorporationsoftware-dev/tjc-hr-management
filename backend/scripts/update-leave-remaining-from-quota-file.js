/*
 * ปรับ "คงเหลือ" ของยอดวันลาให้ตรงกับไฟล์รายงานสถิติการลาตามโควตาของระบบเดิม
 *
 * แตะเฉพาะช่อง adjustedDays (วันที่ HR ปรับเอง) — ไม่แตะโควตา (entitlementDays)
 * ไม่แตะยกยอด และไม่แตะ "ใช้ไปแล้ว" ซึ่งคิดจากใบลาจริงในระบบ
 *
 *   คงเหลือของระบบ = โควตา + ยกยอด + ปรับ - ใช้ไป - รออนุมัติ
 *   ปรับใหม่        = ปรับเดิม + (คงเหลือตามไฟล์ - คงเหลือของระบบ)
 *
 * ทำแบบนี้เพราะสองระบบนับ "ใช้ไป" ต่างกันเล็กน้อย (ระบบเดิมนับใบลาที่ตกวันหยุด
 * นับเศษนาทีเป็นวัน ฯลฯ) ถ้าไปทับ usedDays ตรง ๆ จะขัดกับใบลาที่มีอยู่ในระบบ
 * ส่วนต่างจึงถูกเก็บไว้ที่ช่องปรับ พร้อมโน้ตบอกที่มา
 *
 * แถวที่ไฟล์มีแต่ระบบยังไม่มียอดของปีนั้น: สร้างให้เฉพาะเมื่อไฟล์มีโควตาหรือคงเหลือ
 * ไม่เป็นศูนย์ โดยใส่โควตาตามไฟล์ แล้วปรับให้คงเหลือตรง
 *
 * คอลัมน์ "ขาดงาน" ในไฟล์ไม่ใช่วันลา ข้ามไป
 *
 *   node scripts/update-leave-remaining-from-quota-file.js "<ไฟล์.xlsx>"           พรีวิว
 *   node scripts/update-leave-remaining-from-quota-file.js "<ไฟล์.xlsx>" --apply   เขียนจริง
 *   ตัวเลือก: --year=2026  (ค่าเริ่มต้นคือปีปัจจุบัน)
 */
require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const { PrismaClient } = require('../dist/generated/prisma/client.js');

const p = new PrismaClient();
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const file = args.find((a) => !a.startsWith('--'));
const year = Number((args.find((a) => a.startsWith('--year=')) || '').slice(7)) || new Date().getFullYear();
if (!file) { console.error('ต้องระบุไฟล์'); process.exit(1); }

const txt = (v) => (v == null ? '' : typeof v === 'object' ? String(v.result ?? v.text ?? '') : String(v)).trim();
const num = (v) => { const n = Number(txt(v)); return Number.isFinite(n) ? n : 0; };
const round2 = (n) => Math.round(n * 100) / 100;
const asOf = (() => { const m = path.basename(file).match(/(\d{4}-\d{2}-\d{2})/); return m ? m[1] : new Date().toISOString().slice(0, 10); })();

async function readFile() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.worksheets[0];
  const header = [];
  const sub = [];
  ws.getRow(2).eachCell({ includeEmpty: true }, (c, i) => { header[i] = txt(c.value); });
  ws.getRow(3).eachCell({ includeEmpty: true }, (c, i) => { sub[i] = txt(c.value); });

  /* หาคอลัมน์ "คงเหลือ" และ "โควตาที่ได้รับ" ของแต่ละประเภทลา */
  const types = [];
  for (let i = 1; i < header.length; i += 1) {
    if (sub[i] !== 'โควตาที่ได้รับ') continue;
    const name = header[i].replace(/\s*\(วัน\)\s*$/, '').trim();
    if (!name || name === 'ขาดงาน') continue;
    types.push({ name, quotaCol: i, usedCol: i + 1, remainCol: i + 2 });
  }

  const rows = [];
  ws.eachRow((row, i) => {
    if (i <= 3) return;
    const v = [];
    row.eachCell({ includeEmpty: true }, (c, ci) => { v[ci] = c.value; });
    const m = txt(v[2]).match(/^(\S+)\s*:\s*(.+)$/);
    if (!m) return;
    rows.push({
      code: m[1],
      name: m[2],
      status: txt(v[3]),
      values: types.map((t) => ({ type: t.name, quota: num(v[t.quotaCol]), used: num(v[t.usedCol]), remain: num(v[t.remainCol]) })),
    });
  });
  return { types, rows };
}

(async () => {
  const { types, rows } = await readFile();
  console.log(`ไฟล์: ${path.basename(file)} · พนักงาน ${rows.length} คน · ประเภทลา ${types.length} ประเภท · ปี ${year}`);

  const leaveTypes = await p.leaveType.findMany({ where: { status: 'ACTIVE' }, select: { id: true, nameTh: true, companyId: true } });
  const typeByName = new Map(leaveTypes.map((t) => [t.nameTh.trim(), t]));
  const unknown = types.filter((t) => !typeByName.has(t.name));
  if (unknown.length) console.log('ประเภทลาในไฟล์ที่ระบบไม่มี (ข้าม):', unknown.map((t) => t.name).join(', '));

  const employees = await p.employee.findMany({ where: { deletedAt: null }, select: { id: true, employeeCode: true, displayName: true } });
  const empByCode = new Map(employees.map((e) => [e.employeeCode, e]));

  const balances = await p.leaveBalance.findMany({ where: { year } });
  const balKey = (e, t) => `${e}|${t}`;
  const balMap = new Map(balances.map((b) => [balKey(b.employeeId, b.leaveTypeId), b]));

  const updates = [];
  const creates = [];
  const missingEmp = [];
  const untouched = { same: 0, zero: 0 };

  for (const r of rows) {
    const emp = empByCode.get(r.code);
    if (!emp) { missingEmp.push(`${r.code} ${r.name}`); continue; }
    for (const v of r.values) {
      const lt = typeByName.get(v.type);
      if (!lt) continue;
      const b = balMap.get(balKey(emp.id, lt.id));
      if (!b) {
        if (v.quota === 0 && v.remain === 0) { untouched.zero += 1; continue; }
        creates.push({ emp, lt, quota: v.quota, remain: v.remain, adjusted: round2(v.remain - v.quota) });
        continue;
      }
      const ent = Number(b.entitlementDays), cf = Number(b.carriedForwardDays), adj = Number(b.adjustedDays);
      const used = Number(b.usedDays), pend = Number(b.pendingDays);
      const current = round2(ent + cf + adj - used - pend);
      const delta = round2(v.remain - current);
      if (Math.abs(delta) < 0.005) { untouched.same += 1; continue; }
      updates.push({ emp, lt, b, current, target: v.remain, delta, newAdj: round2(adj + delta), used, ent });
    }
  }

  console.log(`\nคงเหลือตรงอยู่แล้ว ${untouched.same} แถว · ไม่มียอดและไฟล์เป็นศูนย์ ${untouched.zero} แถว`);
  if (missingEmp.length) { console.log(`\nพนักงานในไฟล์ที่ไม่พบในระบบ (${missingEmp.length}):`); missingEmp.forEach((x) => console.log('  ' + x)); }

  console.log(`\n=== จะปรับคงเหลือ ${updates.length} แถว ===`);
  updates.forEach((u) => console.log(
    `  ${u.emp.employeeCode} ${String(u.emp.displayName || '').padEnd(28)} ${u.lt.nameTh.padEnd(26)} คงเหลือ ${String(u.current).padStart(7)} -> ${String(u.target).padStart(7)}  (ปรับ ${u.delta > 0 ? '+' : ''}${u.delta} · โควตา ${u.ent} ใช้ไป ${u.used})`,
  ));
  console.log(`\n=== จะสร้างยอดใหม่ ${creates.length} แถว ===`);
  creates.forEach((c) => console.log(`  ${c.emp.employeeCode} ${String(c.emp.displayName || '').padEnd(28)} ${c.lt.nameTh.padEnd(26)} โควตา ${c.quota} คงเหลือ ${c.remain}`));

  if (!apply) { console.log('\n-- พรีวิวเท่านั้น ใส่ --apply เพื่อเขียนจริง --'); await p.$disconnect(); return; }

  const backupDir = path.resolve(__dirname, '../../backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const backupFile = path.join(backupDir, `before-leave-remaining-${asOf}-${updates.length}.json`);
  fs.writeFileSync(backupFile, JSON.stringify(updates.map((u) => u.b), null, 1));

  const note = `ปรับคงเหลือตามไฟล์รายงานสถิติการลาตามโควตา (ข้อมูล ณ ${asOf})`;
  let n = 0;
  for (const u of updates) {
    await p.leaveBalance.update({
      where: { id: u.b.id },
      data: { adjustedDays: u.newAdj, note: u.b.note ? `${u.b.note} · ${note}` : note },
    });
    n += 1;
  }
  for (const c of creates) {
    await p.leaveBalance.create({
      data: { employeeId: c.emp.id, leaveTypeId: c.lt.id, year, entitlementDays: c.quota, adjustedDays: c.adjusted, note },
    });
    n += 1;
  }
  console.log(`\nเขียนแล้ว ${n} แถว · สำรองค่าเดิมไว้ที่ ${backupFile}`);
  await p.$disconnect();
})().catch((e) => { console.error(e.stack || e.message); process.exit(1); });
