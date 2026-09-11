/*
 * เทียบรายงานเงินสมทบประกันสังคม (สปส.1-10) ของระบบ กับไฟล์ที่ระบบเดิมยื่นจริง
 *
 * ไฟล์ต้นทาง: docs/ประกันสังคม/รายงานประกันสังคมประจำเดือน YYYY-MM_*.xlsx
 * คอลัมน์: เลขบัตรประชาชน | คำนำหน้า | ชื่อ | นามสกุล | ค่าจ้าง | จำนวนเงินสมทบ
 *
 * จับคู่คนด้วยเลขบัตรประชาชน (คนไทยใช้เลขเดียวกันเป็นเลขผู้ประกันตน) และเทียบ
 * "เงินสมทบหลังปัดเป็นบาทเต็ม" เพราะไฟล์ยื่นจริงเก็บเป็นจำนวนเต็มตามคำชี้แจงข้อ 4
 *
 *   node scripts/legacy-payroll-import/check-sso-vs-legacy-file.js
 *   ตัวเลือก: --month=2026-05  ดูเดือนเดียว   --verbose  แจกแจงทุกคนที่ต่าง
 */
require('reflect-metadata');
require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../../dist/app.module.js');
const { PayrollFilingReportService } = require('../../dist/modules/payroll/services/payroll-filing-report.service.js');
const { PrismaService } = require('../../dist/database/prisma.service.js');

const SCOPE = { level: 'GLOBAL', companyId: null, branchId: null };
const DIR = path.join(__dirname, '..', '..', '..', 'docs', 'ประกันสังคม');
const only = (process.argv.find((a) => a.startsWith('--month=')) || '').slice(8);
const verbose = process.argv.includes('--verbose');

/** เซลล์ของ exceljs อาจเป็นสูตร/rich text จึงต้องคลี่ออกก่อน */
const txt = (v) => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return String(v.result ?? v.text ?? (v.richText || []).map((t) => t.text).join('') ?? '');
  return String(v);
};

async function readFiles() {
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.xlsx')).sort();
  const out = [];
  for (const f of files) {
    const month = (f.match(/(\d{4}-\d{2})/) || [])[1];
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(path.join(DIR, f));
    const rows = [];
    wb.eachSheet((ws) => {
      ws.eachRow((row, i) => {
        if (i === 1) return; // หัวตาราง
        const nid = txt(row.getCell(1).value).trim();
        if (!/^\d{10,13}$/.test(nid)) return;
        rows.push({
          nid,
          title: txt(row.getCell(2).value).trim(),
          first: txt(row.getCell(3).value).trim(),
          last: txt(row.getCell(4).value).trim(),
          wage: Number(txt(row.getCell(5).value)) || 0,
          contrib: Number(txt(row.getCell(6).value)) || 0,
        });
      });
    });
    out.push({ month, rows });
  }
  return out;
}

(async () => {
  const file = await readFiles();
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const svc = app.get(PayrollFilingReportService);
  const prisma = app.get(PrismaService);

  const runs = await prisma.payrollRun.findMany({
    where: { deletedAt: null, period: { code: { startsWith: 'PAY-2569-' } } },
    include: { period: true },
    orderBy: { period: { startDate: 'asc' } },
  });

  let totalDiff = 0;
  for (const m of file) {
    if (only && only !== m.month) continue;
    /* ไฟล์เดือน 2026-01 = งวด PAY-2569-01 (26 ธ.ค. - 25 ม.ค.) */
    const code = `PAY-2569-${m.month.slice(5)}`;
    const run = runs.find((r) => r.period.code === code);
    if (!run) { console.log(`${m.month} ไม่พบงวด ${code}`); continue; }

    const rep = await svc.getSocialSecurityReport(run.id, SCOPE);
    const sysByNid = new Map();
    rep.rows.forEach((r) => { if (r.nationalId) sysByNid.set(String(r.nationalId).trim(), r); });
    const fileNids = new Set(m.rows.map((r) => r.nid));

    const onlyFile = m.rows.filter((r) => !sysByNid.has(r.nid));
    const onlySys = rep.rows.filter((r) => !fileNids.has(String(r.nationalId || '').trim()));
    const diffs = [];
    for (const fr of m.rows) {
      const sr = sysByNid.get(fr.nid);
      if (!sr) continue;
      const dw = Math.round((sr.actualWage - fr.wage) * 100) / 100;
      const dc = sr.employeeContributionFiled - fr.contrib;
      if (dw || dc) diffs.push({ ...fr, code: sr.employeeCode, sw: sr.actualWage, sc: sr.employeeContributionFiled, dw, dc });
    }

    const fSum = m.rows.reduce((s, r) => s + r.contrib, 0);
    const gap = rep.summary.totalEmployeeContributionFiled - fSum;
    totalDiff += gap;
    console.log(`\n### ${m.month} (${code})  ไฟล์ ${m.rows.length} คน / ระบบ ${rep.rows.length} คน`);
    console.log(`   เงินสมทบ ไฟล์ ${fSum.toLocaleString()} · ระบบ ${rep.summary.totalEmployeeContributionFiled.toLocaleString()} · ต่าง ${gap}`);
    if (onlyFile.length) console.log(`   มีในไฟล์ ไม่มีในระบบ (${onlyFile.length}): ` + onlyFile.map((r) => `${r.first} ${r.last} สมทบ ${r.contrib}`).join(', '));
    if (onlySys.length) console.log(`   มีในระบบ ไม่มีในไฟล์ (${onlySys.length}): ` + onlySys.map((r) => `${r.employeeCode} ${r.employeeName} สมทบ ${r.employeeContributionFiled}`).join(', '));
    if (!diffs.length) console.log('   ทุกคนตัวเลขตรง');
    else {
      console.log(`   ตัวเลขไม่ตรง ${diffs.length} คน`);
      if (verbose || diffs.length <= 12) diffs.forEach((d) => console.log(`     ${d.code} ${d.first} ${d.last}: ค่าจ้าง ${d.wage} -> ${d.sw} · สมทบ ${d.contrib} -> ${d.sc}`));
    }
  }
  console.log(`\nรวมส่วนต่างเงินสมทบทุกงวด ${totalDiff} บาท`);

  await app.close();
  process.exit(0);
})().catch((e) => { console.error(e.stack || e); process.exit(1); });
