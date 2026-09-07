/*
 * ตั้งวันหยุดรายคนให้ตรงกับไฟล์รายงานตารางเวลาการทำงานของระบบเดิม
 * -----------------------------------------------------------------------------
 * ระบบนี้ตั้งวันหยุดประจำสัปดาห์ไว้ที่ "อาทิตย์" ทั้งบริษัท แต่ในไฟล์ระบบเดิม
 * มีพนักงานบางคนที่หยุดวันอื่นเพิ่ม (พนักงานฝึกงาน พนักงานที่ทำไม่เต็มสัปดาห์
 * คนที่สลับเวรหยุด) วันพวกนั้นถ้าไม่ตั้งไว้ ระบบจะตีเป็น "ขาดงาน" ทั้งที่เขาหยุดจริง
 *
 * สคริปต์นี้อ่านคอลัมน์ "สถานะ" ของไฟล์ แล้วเติมวันหยุดรายคน (holiday_swaps
 * แบบ originalHolidayDate = NULL คือ "ให้วันหยุดเพิ่ม") เฉพาะวันที่
 *   ไฟล์ = วันหยุดพนักงาน  แต่  ระบบ = วันทำงาน
 *
 * ข้ามคนที่มีใบสลับวันหยุดของวันนั้นอยู่แล้ว — ใบพวกนั้นคือการตัดสินใจในระบบนี้
 * ซึ่งใหม่กว่าไฟล์ ไม่ควรถูกทับ (สคริปต์จะรายงานให้เห็นว่าข้ามใครไปบ้าง)
 *
 *   node scripts/sync-timesheet-holidays.js "<ไฟล์.xlsx>"           พรีวิว
 *   node scripts/sync-timesheet-holidays.js "<ไฟล์.xlsx>" --apply   เขียนจริง
 *   ตัวเลือก: --from=YYYY-MM-DD --to=YYYY-MM-DD
 *
 * เขียนแล้วต้องสั่ง recalc-attendance-range.js ของช่วงนั้นซ้ำ ยอดถึงจะเปลี่ยน
 */
require('dotenv').config({ quiet: true });

const { existsSync } = require('fs');
const { randomUUID } = require('crypto');
const { resolve } = require('path');
const ExcelJS = require('exceljs');
const { PrismaClient } = require('../dist/generated/prisma/client.js');

const COMPANY_ID = process.env.IMPORT_COMPANY_ID || 'cmstqxdhf004ttm7wqvoaszwq';

function cellText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    if (value.text !== undefined) return String(value.text).trim();
    if (value.result !== undefined) return String(value.result).trim();
    if (Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join('').trim();
    }
    return '';
  }
  return String(value).trim();
}

function parseFileDate(raw) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : null;
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const fromArg = (args.find((arg) => arg.startsWith('--from=')) || '').slice(7);
  const toArg = (args.find((arg) => arg.startsWith('--to=')) || '').slice(5);
  const filePathArg = args.find((arg) => !arg.startsWith('--'));

  if (!filePathArg) {
    console.error('ต้องระบุไฟล์');
    process.exit(1);
  }

  const sourcePath = resolve(filePathArg);
  if (!existsSync(sourcePath)) {
    console.error(`ไม่พบไฟล์ ${sourcePath}`);
    process.exit(1);
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(sourcePath);
  const worksheet = workbook.worksheets[0];

  const fileHolidays = [];
  let code = null;
  let name = '';

  for (let index = 3; index <= worksheet.rowCount; index += 1) {
    const row = worksheet.getRow(index);
    const first = cellText(row.getCell(1).value);
    const second = cellText(row.getCell(2).value);

    if (first && first === second) {
      if (first.includes(' : ')) {
        const [rawCode, rest] = first.split(' : ');
        code = rawCode.trim();
        name = (rest ?? '').split(' แผนก:')[0].trim();
      }
      continue;
    }

    const dateKey = parseFileDate(second);
    if (!dateKey || !code) continue;
    if (cellText(row.getCell(3).value) !== 'วันหยุดพนักงาน') continue;
    if (fromArg && dateKey < fromArg) continue;
    if (toArg && dateKey > toArg) continue;

    const punches = [];
    for (let col = 5; col <= 16; col += 1) {
      const time = cellText(row.getCell(col).value);
      if (/^\d{1,2}:\d{2}$/.test(time)) punches.push(time);
    }

    fileHolidays.push({ code, name, dateKey, punches });
  }

  const prisma = new PrismaClient();
  const reason = `ตามรายงานตารางเวลาการทำงาน ${fileHolidays[0]?.dateKey.slice(0, 7) ?? ''}`;

  try {
    const employees = await prisma.employee.findMany({
      where: { companyId: COMPANY_ID, deletedAt: null },
      select: { id: true, employeeCode: true },
    });
    const employeeByCode = new Map(
      employees.map((employee) => [employee.employeeCode, employee.id]),
    );

    const dates = fileHolidays.map((item) => item.dateKey).sort();
    const summaries = await prisma.$queryRawUnsafe(
      `
      SELECT e."employeeCode" AS code, s."workDate"::text AS d,
             COALESCE((s."policySnapshot" -> 'holiday' ->> 'isHoliday')::boolean, false) AS is_holiday
      FROM attendance_daily_summaries s
      JOIN employees e ON e.id = s."employeeId"
      WHERE e."companyId" = $1 AND s."workDate" BETWEEN $2::date AND $3::date
      `,
      COMPANY_ID,
      dates[0],
      dates[dates.length - 1],
    );
    const systemHoliday = new Map(
      summaries.map((row) => [`${row.code}|${row.d}`, row.is_holiday]),
    );

    const existingSwaps = await prisma.$queryRawUnsafe(
      `
      SELECT "scopeId", "originalHolidayDate"::text AS original, "swappedHolidayDate"::text AS swapped
      FROM holiday_swaps
      WHERE "deletedAt" IS NULL AND status = 'ACTIVE' AND "companyId" = $1
      `,
      COMPANY_ID,
    );
    const swapKeys = new Set();
    for (const swap of existingSwaps) {
      if (swap.original) swapKeys.add(`${swap.scopeId}|${swap.original}`);
      if (swap.swapped) swapKeys.add(`${swap.scopeId}|${swap.swapped}`);
    }

    const toCreate = [];
    const skippedBySwap = [];
    const workedOnHoliday = [];
    const missingEmployee = [];

    for (const item of fileHolidays) {
      const employeeId = employeeByCode.get(item.code);

      if (!employeeId) {
        missingEmployee.push(`${item.code} ${item.dateKey}`);
        continue;
      }

      /* ระบบถือว่าเป็นวันหยุดอยู่แล้ว (อาทิตย์ / วันหยุดบริษัท) ไม่ต้องทำอะไร */
      const key = `${item.code}|${item.dateKey}`;
      if (systemHoliday.get(key) !== false) continue;

      if (swapKeys.has(`${employeeId}|${item.dateKey}`)) {
        skippedBySwap.push(`${item.code} ${item.name} ${item.dateKey}`);
        continue;
      }

      if (item.punches.length) {
        workedOnHoliday.push(
          `${item.code} ${item.name} ${item.dateKey} · แตะบัตร ${item.punches.join(' ')}`,
        );
      }

      toCreate.push({ ...item, employeeId });
    }

    console.log('\n=== วันหยุดรายคนที่ยังไม่ตรงกับไฟล์ ===');
    console.log(`จะเพิ่มวันหยุด : ${toCreate.length} วัน`);
    for (const item of toCreate) {
      console.log(`  ${item.code} ${item.name} ${item.dateKey}`);
    }

    if (skippedBySwap.length) {
      console.log(`\nข้าม (มีใบสลับวันหยุดในระบบอยู่แล้ว) : ${skippedBySwap.length}`);
      for (const item of skippedBySwap) console.log(`  ${item}`);
    }

    if (workedOnHoliday.length) {
      console.log(`\nระวัง — วันหยุดที่มีรอยแตะบัตร (มาทำงานในวันหยุด) : ${workedOnHoliday.length}`);
      for (const item of workedOnHoliday) console.log(`  ${item}`);
    }

    if (missingEmployee.length) {
      console.log(`\nไม่พบพนักงาน : ${missingEmployee.join(', ')}`);
    }

    if (!apply) {
      console.log('\n-- พรีวิวเท่านั้น ใส่ --apply เพื่อเขียนจริง --\n');
      return;
    }

    for (const item of toCreate) {
      await prisma.$executeRawUnsafe(
        `
        INSERT INTO holiday_swaps (
          id, "originalHolidayDate", "swappedHolidayDate", "scopeType", "scopeId",
          name, reason, status, "companyId", "createdAt", "updatedAt"
        ) VALUES ($1, NULL, $2::date, 'EMPLOYEE', $3, $4, $5, 'ACTIVE', $6, NOW(), NOW())
        `,
        randomUUID(),
        item.dateKey,
        item.employeeId,
        'ให้วันหยุดเพิ่ม',
        reason,
        COMPANY_ID,
      );
    }

    console.log(`\nเพิ่มวันหยุดรายคนแล้ว ${toCreate.length} วัน`);
    console.log('อย่าลืมสั่ง recalc-attendance-range.js ของช่วงนั้นซ้ำ\n');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
