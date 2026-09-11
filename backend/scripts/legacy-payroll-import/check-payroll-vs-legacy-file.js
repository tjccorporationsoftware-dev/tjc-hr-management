/*
 * รายงานเทียบผลคำนวณเงินเดือนของระบบกับไฟล์ระบบเดิม ทั้ง 7 งวด
 * เขียนเป็นไฟล์ข้อความงวดละไฟล์ พร้อมสรุปรวมท้ายรายงาน
 *
 *   node tmp-report-pay.js [--out=โฟลเดอร์]
 */
require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('../../dist/generated/prisma/client.js');

const p = new PrismaClient();
const MAP = {
  'PAY-2569-01': '2026-01',
  'PAY-2569-02': '2026-02',
  'PAY-2569-03': '2026-03',
  'PAY-2569-04': '2026-04',
  'PAY-2569-05': '2026-05',
  'PAY-2569-06': '2026-06',
  'PAY-2569-07': '2026-07',
  'PAY-2569-08': '2026-08',
};

/** ช่องในไฟล์ -> รหัสรายการของระบบที่ต้องตรงกัน */
const GROUPS = [
  ['เงินเดือน', ['BASE_SALARY']],
  ['โอทีล่วงเวลา(x1.0)', ['OVERTIME_PAY']],
  ['โอทีล่วงเวลาวันหยุด(x1.5)', ['OT_HOLIDAY', 'OT_SPECIAL_HOLIDAY']],
  ['เบี้ยขยัน', ['ATTENDANCE_INCENTIVE']],
  ['ค่าตำแหน่ง', ['POSITION_ALLOWANCE']],
  ['ค่าเดินทาง', ['TRANSPORT_ALLOWANCE']],
  ['ค่าโทรศัพท์', ['PHONE_ALLOWANCE']],
  ['เบี้ยเลี้ยง', ['PER_DIEM']],
  ['เงินพิเศษผู้บริหาร', ['EXECUTIVE_ALLOWANCE']],
  ['สาย', ['LATE_DEDUCTION']],
  ['กลับก่อน', ['EARLY_LEAVE_DEDUCTION']],
  ['ลางาน', ['UNPAID_LEAVE_DEDUCTION', 'ATTENDANCE_UNPAID_LEAVE_DEDUCTION', 'ATTENDANCE_UNPAID_LEAVE_RECONCILE']],
  ['ขาดงาน', ['ABSENCE_DEDUCTION']],
  ['ประกันสังคม', ['SOCIAL_SECURITY']],
  ['ค่าปรับ', ['PENALTY', 'MISSING_LOG_DEDUCTION']],
  ['กองทุนกู้ยืม กยศ.', ['STUDENT_LOAN', 'KYS']],
  ['กรอ', ['ICL_LOAN', 'KOROR']],
  ['ค่าเช่าห้อง', ['ROOM_RENT']],
  ['เงินประกันการทำงาน', ['WORK_GUARANTEE']],
];

const num = (v) => Math.round((Number(v) || 0) * 100) / 100;
const money = (v) => num(v).toLocaleString('th-TH', { minimumFractionDigits: 2 });

(async () => {
  const outDir = (process.argv.find((a) => a.startsWith('--out=')) || '--out=.').slice(6);
  fs.mkdirSync(outDir, { recursive: true });
  const file = JSON.parse(fs.readFileSync(path.join(__dirname,'legacy-payroll-file.json'), 'utf8'));

  const overall = { fileNet: 0, sysNet: 0, empDiff: 0, emp: 0 };
  const summaryLines = [];

  for (const [pcode, tag] of Object.entries(MAP)) {
    const lines = await p.$queryRawUnsafe(
      `SELECT e."employeeCode" code, l.code lc, SUM(l.amount)::float amt
       FROM payroll_lines l JOIN payroll_items i ON i.id=l."payrollItemId"
       JOIN payroll_runs r ON r.id=i."runId" JOIN payroll_periods pp ON pp.id=r."periodId"
       JOIN employees e ON e.id=i."employeeId"
       WHERE pp.code=$1 AND r."deletedAt" IS NULL AND l.type<>'EMPLOYER_CONTRIBUTION'
       GROUP BY 1,2`,
      pcode,
    );
    const sys = new Map();
    for (const r of lines) {
      if (!sys.has(r.code)) sys.set(r.code, {});
      sys.get(r.code)[r.lc] = num(r.amt);
    }

    const totals = await p.$queryRawUnsafe(
      `SELECT e."employeeCode" code, i."totalEarnings"::float er, i."totalDeductions"::float de, i."totalNetPay"::float np
       FROM payroll_items i JOIN payroll_runs r ON r.id=i."runId" JOIN payroll_periods pp ON pp.id=r."periodId"
       JOIN employees e ON e.id=i."employeeId" WHERE pp.code=$1 AND r."deletedAt" IS NULL`,
      pcode,
    );
    const totBy = new Map(totals.map((t) => [t.code, t]));

    const rows = file[tag] || [];
    const out = [];
    const groupDiff = {};
    const perEmp = [];
    let fileNet = 0;
    let sysNet = 0;

    for (const fr of rows) {
      const s = sys.get(fr.code);
      const t = totBy.get(fr.code);
      const fn = num(fr['คงเหลือ']);
      fileNet += fn;
      if (!s) {
        perEmp.push({ code: fr.code, name: fr.name, f: fn, y: 0, d: -fn, why: 'ไม่มีในรอบคำนวณ' });
        continue;
      }
      const yn = num(t?.np || 0);
      sysNet += yn;
      for (const [label, codes] of GROUPS) {
        const f = num(fr[label] || 0);
        const y = num(codes.reduce((a, c) => a + (s[c] || 0), 0));
        if (Math.abs(f - y) >= 0.01) {
          groupDiff[label] = groupDiff[label] || [];
          groupDiff[label].push({ code: fr.code, name: fr.name, f, y, d: num(y - f) });
        }
      }
      if (Math.abs(fn - yn) >= 0.01) perEmp.push({ code: fr.code, name: fr.name, f: fn, y: yn, d: num(yn - fn) });
    }

    out.push(`=== ${tag} · งวด ${pcode} ===`);
    out.push(`พนักงานในไฟล์ ${rows.length} · คำนวณได้ ${totBy.size}`);
    out.push(`เงินสุทธิ  ไฟล์ ${money(fileNet)} · ระบบ ${money(sysNet)} · ต่าง ${money(sysNet - fileNet)}`);
    out.push('');
    out.push('--- แยกตามช่อง ---');
    for (const [label] of GROUPS) {
      const list = groupDiff[label] || [];
      const sum = num(list.reduce((a, x) => a + x.d, 0));
      out.push(`${label.padEnd(28)} ${list.length ? `ไม่ตรง ${String(list.length).padStart(3)} คน · รวม ${money(sum)}` : 'ตรงกันหมด'}`);
    }
    for (const [label, list] of Object.entries(groupDiff)) {
      out.push('');
      out.push(`--- ${label} (${list.length}) ---`);
      list.sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
      list.forEach((x) => out.push(`  ${x.code} ${x.name}: ไฟล์ ${money(x.f)} · ระบบ ${money(x.y)} · ต่าง ${money(x.d)}`));
    }
    out.push('');
    out.push(`--- เงินสุทธิรายคนที่ไม่ตรง (${perEmp.length}) ---`);
    perEmp.sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
    perEmp.forEach((x) => out.push(`  ${x.code} ${x.name}: ไฟล์ ${money(x.f)} · ระบบ ${money(x.y)} · ต่าง ${money(x.d)}${x.why ? ' · ' + x.why : ''}`));

    fs.writeFileSync(path.join(outDir, `${tag}-payroll-check.txt`), out.join('\n'), 'utf8');

    overall.fileNet += fileNet;
    overall.sysNet += sysNet;
    overall.empDiff += perEmp.length;
    overall.emp += rows.length;
    summaryLines.push(
      `${tag} | คน ${String(rows.length).padStart(3)} | สุทธิไฟล์ ${money(fileNet).padStart(15)} | ระบบ ${money(sysNet).padStart(15)} | ต่าง ${money(sysNet - fileNet).padStart(10)} | คนที่ไม่ตรง ${perEmp.length}`,
    );
  }

  console.log(summaryLines.join('\n'));
  console.log('-'.repeat(100));
  console.log(
    `รวม 7 งวด | รายการ ${overall.emp} | ไฟล์ ${money(overall.fileNet)} | ระบบ ${money(overall.sysNet)} | ต่าง ${money(overall.sysNet - overall.fileNet)} | คนที่ไม่ตรง ${overall.empDiff}`,
  );
  console.log(`รายงานรายงวดอยู่ที่ ${outDir}`);
  await p.$disconnect();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
