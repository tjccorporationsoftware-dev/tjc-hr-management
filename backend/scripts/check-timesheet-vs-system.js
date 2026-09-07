/*
 * ไล่เทียบไฟล์รายงานตารางเวลาการทำงานของระบบเดิม กับข้อมูลในระบบนี้ ทุกคนทุกวัน
 * -----------------------------------------------------------------------------
 * ใช้หลังนำเข้าเสร็จ (import-timesheet-file.js + import-timesheet-extras.js
 * + recalc-attendance-range.js) เพื่อดูว่าเหลือแถวไหนที่ยังไม่ตรงกับต้นทาง
 *
 * เทียบ 6 อย่างต่อหนึ่งคน-หนึ่งวัน
 *   1. เวลาเข้าเช้า / เข้าบ่าย / ออกงาน   (รอยแตะบัตรแรก / กลางที่อยู่ช่วงบ่าย / สุดท้าย)
 *   2. นาทีสาย
 *   3. นาทีลา (รวมทั้งใบที่ 1 และ 2)
 *   4. ชั่วโมงโอที
 *   5. วันหยุด/วันทำงาน
 *   6. ขาดงาน (ระบบเดิมนับเป็นชั่วโมง ระบบนี้นับเป็นวัน จึงเทียบแค่ "มี/ไม่มี")
 *
 *   node scripts/check-timesheet-vs-system.js "<ไฟล์.xlsx>" [--out=รายงาน.txt]
 *   ตัวเลือก: --from=YYYY-MM-DD --to=YYYY-MM-DD
 */
require('dotenv').config({ quiet: true });

const { existsSync, writeFileSync } = require('fs');
const { resolve } = require('path');
const ExcelJS = require('exceljs');
const { PrismaClient } = require('../dist/generated/prisma/client.js');

const COMPANY_ID = process.env.IMPORT_COMPANY_ID || 'cmstqxdhf004ttm7wqvoaszwq';

const AFTERNOON_WINDOW_START = '11:30';
const AFTERNOON_WINDOW_END = '16:59';

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

function parseDurationMinutes(raw) {
  const match = /^(\d{1,3}):(\d{2})$/.exec(raw);
  return match ? Number(match[1]) * 60 + Number(match[2]) : 0;
}

function parseFileDate(raw) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : null;
}

function readFileRows(worksheet) {
  const rows = [];
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

    const punches = [];
    for (let col = 5; col <= 16; col += 1) {
      const time = cellText(row.getCell(col).value);
      if (/^\d{1,2}:\d{2}$/.test(time)) punches.push(time.padStart(5, '0'));
    }

    const middles = punches.slice(1, -1);
    const afternoonCandidates = middles.filter(
      (time) => time >= AFTERNOON_WINDOW_START && time <= AFTERNOON_WINDOW_END,
    );

    rows.push({
      code,
      name,
      dateKey,
      isHoliday: cellText(row.getCell(3).value) === 'วันหยุดพนักงาน',
      punches,
      morningIn: punches[0] ?? null,
      afternoonIn: afternoonCandidates.length
        ? afternoonCandidates[afternoonCandidates.length - 1]
        : null,
      checkOut: punches.length > 1 ? punches[punches.length - 1] : null,
      lateMinutes: Number(cellText(row.getCell(21).value)) || 0,
      leaveMinutes:
        parseDurationMinutes(cellText(row.getCell(23).value)) +
        parseDurationMinutes(cellText(row.getCell(25).value)),
      otMinutes:
        parseDurationMinutes(cellText(row.getCell(19).value)) +
        parseDurationMinutes(cellText(row.getCell(20).value)),
      absentMinutes: parseDurationMinutes(cellText(row.getCell(27).value)),
    });
  }

  return rows;
}

async function main() {
  const args = process.argv.slice(2);
  const fromArg = (args.find((arg) => arg.startsWith('--from=')) || '').slice(7);
  const toArg = (args.find((arg) => arg.startsWith('--to=')) || '').slice(5);
  const outArg = (args.find((arg) => arg.startsWith('--out=')) || '').slice(6);
  const filePathArg = args.find((arg) => !arg.startsWith('--'));

  if (!filePathArg) {
    console.error('ต้องระบุไฟล์ที่จะเทียบ');
    process.exit(1);
  }

  const sourcePath = resolve(filePathArg);
  if (!existsSync(sourcePath)) {
    console.error(`ไม่พบไฟล์ ${sourcePath}`);
    process.exit(1);
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(sourcePath);

  const fileRows = readFileRows(workbook.worksheets[0]).filter(
    (row) => (!fromArg || row.dateKey >= fromArg) && (!toArg || row.dateKey <= toArg),
  );

  const prisma = new PrismaClient();
  const lines = [];
  const say = (text = '') => {
    console.log(text);
    lines.push(text);
  };

  try {
    const dates = fileRows.map((row) => row.dateKey).sort();

    /*
     * ดึงสรุปเวลารายวันพร้อมเวลาไทย — ฐานเก็บ logTime เป็น UTC
     * ต้องบวก 7 ชั่วโมงก่อนเทียบกับหน้าปัดในไฟล์
     */
    const summaries = await prisma.$queryRawUnsafe(
      `
      SELECT e."employeeCode" AS code,
             s."workDate"::text AS d,
             to_char(s."morningInAt" + interval '7 hour', 'HH24:MI') AS morning_in,
             to_char(s."afternoonInAt" + interval '7 hour', 'HH24:MI') AS afternoon_in,
             to_char(s."checkOutAt" + interval '7 hour', 'HH24:MI') AS check_out,
             s."totalLateMinutes"::int AS late,
             (s."paidLeaveMinutes" + s."unpaidLeaveMinutes")::int AS leave_minutes,
             s."approvedOtMinutes"::int AS ot_minutes,
             s."isAbsent" AS absent,
             COALESCE((s."policySnapshot" -> 'holiday' ->> 'isHoliday')::boolean, false) AS is_holiday
      FROM attendance_daily_summaries s
      JOIN employees e ON e.id = s."employeeId"
      WHERE e."companyId" = $1 AND s."workDate" BETWEEN $2::date AND $3::date
      `,
      COMPANY_ID,
      dates[0],
      dates[dates.length - 1],
    );

    const systemByKey = new Map(
      summaries.map((row) => [`${row.code}|${row.d}`, row]),
    );

    const buckets = {
      เวลาเข้าเช้า: [],
      เวลาเข้าบ่าย: [],
      เวลาออกงาน: [],
      นาทีสาย: [],
      นาทีลา: [],
      ชั่วโมงโอที: [],
      วันหยุด: [],
      ขาดงาน: [],
      ไม่มีในระบบ: [],
    };

    let compared = 0;

    for (const row of fileRows) {
      const system = systemByKey.get(`${row.code}|${row.dateKey}`);
      const label = `${row.code} ${row.dateKey} ${row.name}`;

      if (!system) {
        /* วันที่ยังไม่มีข้อมูลอะไรเลยทั้งสองฝั่ง ไม่ต้องรายงาน */
        if (row.punches.length || row.leaveMinutes || row.otMinutes) {
          buckets['ไม่มีในระบบ'].push(`${label}: ไฟล์มีข้อมูลแต่ระบบไม่มีแถวสรุปเวลา`);
        }
        continue;
      }

      compared += 1;

      const compare = (bucket, fileValue, systemValue) => {
        if (String(fileValue ?? '-') === String(systemValue ?? '-')) return;
        buckets[bucket].push(
          `${label}: ไฟล์ ${fileValue ?? '-'} · ระบบ ${systemValue ?? '-'}`,
        );
      };

      compare('เวลาเข้าเช้า', row.morningIn, system.morning_in);
      compare('เวลาเข้าบ่าย', row.afternoonIn, system.afternoon_in);
      compare('เวลาออกงาน', row.checkOut, system.check_out);
      compare('นาทีสาย', row.lateMinutes, system.late);
      compare('นาทีลา', row.leaveMinutes, system.leave_minutes);
      compare('ชั่วโมงโอที', row.otMinutes, system.ot_minutes);
      compare('วันหยุด', row.isHoliday, system.is_holiday);

      /* ระบบเดิมนับขาดงานเป็นชั่วโมง ระบบนี้เป็นวัน เทียบได้แค่ว่ามีหรือไม่มี */
      if ((row.absentMinutes > 0) !== Boolean(system.absent)) {
        buckets['ขาดงาน'].push(
          `${label}: ไฟล์ ${row.absentMinutes ? `ขาด ${row.absentMinutes} นาที` : 'ไม่ขาด'}` +
            ` · ระบบ ${system.absent ? 'ขาดงาน 1 วัน' : 'ไม่ขาด'}`,
        );
      }
    }

    say('=== สรุปการเทียบ ===');
    say(`ช่วงวันที่ : ${dates[0]} ถึง ${dates[dates.length - 1]}`);
    say(`แถวในไฟล์ : ${fileRows.length}`);
    say(`เทียบได้   : ${compared}`);
    say('');

    for (const [name, items] of Object.entries(buckets)) {
      const status = items.length === 0 ? 'ตรงกันหมด' : `ไม่ตรง ${items.length} แถว`;
      say(`${name.padEnd(14, ' ')} : ${status}`);
    }

    for (const [name, items] of Object.entries(buckets)) {
      if (items.length === 0) continue;
      say('');
      say(`--- ${name} (${items.length}) ---`);
      for (const item of items) say(`  ${item}`);
    }

    if (outArg) {
      writeFileSync(resolve(outArg), lines.join('\n'), 'utf8');
      console.log(`\nเขียนรายงานลง ${resolve(outArg)}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
