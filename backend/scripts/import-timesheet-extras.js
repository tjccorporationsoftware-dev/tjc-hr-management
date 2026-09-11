/*
 * นำเข้า "ของที่ไม่ใช่รอยแตะบัตร" จากไฟล์รายงานตารางเวลาการทำงานของระบบเดิม
 * -----------------------------------------------------------------------------
 * ไฟล์เดียวกับที่ scripts/import-timesheet-file.js ใช้ แต่คนละคอลัมน์
 *   - คอลัมน์ ลางาน #1/#2 + ประเภทการลา  ->  ใบลา (LeaveRequest) สถานะอนุมัติแล้ว
 *   - คอลัมน์ โอทีล่วงเวลา (x1.0/x1.5)   ->  ใบโอที (OvertimeRequest) สถานะอนุมัติแล้ว
 *   - คอลัมน์ สาย/กลับก่อน/ขาดงาน        ->  ไม่นำเข้า แค่รายงานให้ดู
 *
 * ทำไมไม่นำเข้าสาย/ขาดงาน: สองระบบคิดคนละกติกา ระบบนี้คำนวณเองจากรอยแตะบัตร
 * ที่นำเข้าไป ถ้ายกตัวเลขของระบบเดิมมาทับจะได้ข้อมูลสองมาตรฐานปนกัน
 * แต่ "ใบลา" กับ "ใบโอที" ต้องนำเข้า เพราะเป็นข้อเท็จจริงที่ระบบเดิมอนุมัติไว้แล้ว
 * ตัวคำนวณของเราหาเองไม่ได้ ถ้าไม่มีใบลา วันที่ลาจะกลายเป็นขาดงาน/ลืมสแกน
 *
 * ตำแหน่งเวลาของใบลา: ไฟล์บอกแค่ "ลากี่ชั่วโมง" ไม่บอกว่าช่วงไหนของวัน
 * จึงเดาจากรอยแตะบัตรของวันนั้น — มาสายเท่ากับเวลาที่ลา = ลาต้นวัน,
 * กลับก่อนเท่ากับเวลาที่ลา = ลาท้ายวัน (เลือกอันที่ใกล้กว่า)
 * ใบลารายชั่วโมงที่ไม่มี startTime/endTime ตัวคำนวณจะทิ้งทั้งใบ จึงต้องมีเสมอ
 *
 *   node scripts/import-timesheet-extras.js "<ไฟล์.xlsx>"           พรีวิว
 *   node scripts/import-timesheet-extras.js "<ไฟล์.xlsx>" --apply   เขียนจริง
 *   ตัวเลือก: --from=YYYY-MM-DD --to=YYYY-MM-DD  จำกัดช่วงวันที่
 *
 * นำเข้าซ้ำได้: ลบใบที่เคยนำเข้าด้วยรหัสชุดเดียวกันของช่วงวันนั้นทิ้งก่อนเขียนใหม่
 * (ดูจาก requestNo ที่ขึ้นต้นด้วย LV-IMP-<งวด> / OT-IMP-<งวด>) ไม่แตะใบที่คนกรอกเอง
 */
require('dotenv').config({ quiet: true });

const { existsSync } = require('fs');
const { basename, resolve } = require('path');
const ExcelJS = require('exceljs');
const { PrismaClient } = require('../dist/generated/prisma/client.js');

const COMPANY_ID = process.env.IMPORT_COMPANY_ID || 'cmstqxdhf004ttm7wqvoaszwq';
const ACTOR_USER_ID = process.env.IMPORT_ACTOR_ID || 'cmso9a51300sbtmesx37xlexo';

/** คอลัมน์ในไฟล์ (นับจาก 1) */
const COL = {
  employee: 1,
  workDate: 2,
  dayStatus: 3,
  shift: 4,
  punchFirst: 5,
  punchLast: 16,
  otNormal: 19,
  otHoliday: 20,
  leave: [
    { duration: 23, type: 24 },
    { duration: 25, type: 26 },
  ],
  absent: 27,
  note: 28,
};

const HOLIDAY_STATUS = 'วันหยุดพนักงาน';

/** ชื่อประเภทการลาในไฟล์ -> code ของ LeaveType ในระบบ */
const LEAVE_TYPE_BY_NAME = {
  'ลาป่วยมีใบรับรองแพทย์': 'SICK_CERTIFIED',
  'ลาป่วยไม่ได้รับค่าจ้าง': 'SICK_UNPAID',
  'ลากิจได้รับค่าจ้าง': 'PERSONAL_PAID',
  'ลากิจไม่ได้รับค่าจ้าง': 'PERSONAL_UNPAID',
  'ลาพักร้อน': 'ANNUAL',
  'ลาคลอดได้รับค่าจ้าง': 'MATERNITY_PAID',
  'ลาคลอดไม่ได้รับค่าจ้าง': 'MATERNITY_UNPAID',
  'ลาอุปสมบทได้รับค่าจ้าง': 'ORDINATION_PAID',
  'ลาอุปสมบทไม่ได้รับค่าจ้าง': 'ORDINATION_UNPAID',
  'ลาฝึกอบรม': 'TRAINING',
  'ลาเพื่อทำหมัน': 'STERILIZATION',
  'การลาเพื่อจัดงานขาวดำ': 'FUNERAL',
  'ลาเพื่อจัดงานสมรส': 'RESERVED_14',
};

/*
 * ช่วงเวลาทำงานของแต่ละกะ ให้ตรงกับที่ตัวคำนวณใช้
 * (resolveHourlyLeaveWorkingSegments ใน attendance.service.ts)
 * เช้า = เวลาเข้างาน ถึงเวลาเปิดรอบบ่าย · บ่าย = เวลาเข้าบ่าย ถึงเวลาเลิกงาน
 */
const SHIFT_SEGMENTS = {
  '08:00 - 17:00': [
    { start: 8 * 60, end: 12 * 60 },
    { start: 13 * 60, end: 17 * 60 },
  ],
  '07:30 - 16:30': [
    { start: 7 * 60 + 30, end: 11 * 60 + 30 },
    { start: 13 * 60, end: 16 * 60 + 30 },
  ],
};

const DEFAULT_SEGMENTS = SHIFT_SEGMENTS['08:00 - 17:00'];

function fail(message) {
  console.error(`\nERROR: ${message}\n`);
  process.exit(1);
}

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

/** "HH:MM" -> จำนวนนาที (คืน null ถ้าไม่ใช่รูปแบบเวลา) */
function parseDurationMinutes(raw) {
  const match = /^(\d{1,3}):(\d{2})$/.exec(raw);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function parseClockMinutes(raw) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(raw);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

function formatClock(minutes) {
  const wrapped = Math.max(0, Math.min(24 * 60 - 1, Math.round(minutes)));
  const hour = Math.floor(wrapped / 60);
  const minute = wrapped % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/** "26/08/2026" -> "2026-08-26" */
function parseFileDate(raw) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw);
  if (!match) return null;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

/* เวลาในไฟล์เป็นเวลาไทยตามหน้าปัด ต้องระบุ +07:00 เสมอ ไม่งั้นเพี้ยนไป 7 ชั่วโมง */
function bangkokDateTime(dateKey, minutes) {
  return new Date(`${dateKey}T${formatClock(minutes)}:00.000+07:00`);
}

function dateOnly(dateKey) {
  return new Date(`${dateKey}T00:00:00.000Z`);
}

function segmentsOf(shift) {
  return SHIFT_SEGMENTS[shift] ?? DEFAULT_SEGMENTS;
}

function workingMinutesTotal(segments) {
  return segments.reduce((sum, segment) => sum + (segment.end - segment.start), 0);
}

/** นาทีทำงานจริงระหว่างสองจุดเวลา (ตัดพักเที่ยงออก) */
function workingMinutesBetween(segments, from, to) {
  if (from >= to) return 0;
  return segments.reduce(
    (sum, segment) =>
      sum + Math.max(0, Math.min(to, segment.end) - Math.max(from, segment.start)),
    0,
  );
}

/** เดินหน้าจาก start จนกินเวลาทำงานครบ need นาที แล้วคืนจุดสิ้นสุด */
function advanceFromStart(segments, start, need) {
  let remaining = need;
  let cursor = Math.max(start, segments[0].start);

  for (const segment of segments) {
    if (remaining <= 0) break;
    if (segment.end <= cursor) continue;
    cursor = Math.max(cursor, segment.start);
    const available = segment.end - cursor;
    if (available >= remaining) return cursor + remaining;
    remaining -= available;
    cursor = segment.end;
  }

  return cursor;
}

/** ถอยหลังจาก end จนกินเวลาทำงานครบ need นาที แล้วคืนจุดเริ่ม */
function retreatFromEnd(segments, end, need) {
  let remaining = need;
  let cursor = Math.min(end, segments[segments.length - 1].end);

  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const segment = segments[index];
    if (remaining <= 0) break;
    if (segment.start >= cursor) continue;
    cursor = Math.min(cursor, segment.end);
    const available = cursor - segment.start;
    if (available >= remaining) return cursor - remaining;
    remaining -= available;
    cursor = segment.start;
  }

  return cursor;
}

/**
 * เดาว่าใบลาอยู่ต้นวันหรือท้ายวัน จากรอยแตะบัตรของวันนั้น
 *
 * มาสายกี่นาที / กลับก่อนกี่นาที เทียบกับเวลาที่ลา อันไหนใกล้กว่าคืออันนั้น
 * ไม่มีรอยแตะบัตรเลย = ลาต้นวัน (ลาเต็มวันไม่ได้ผ่านทางนี้อยู่แล้ว)
 * ถ้าวันเดียวกันมีใบที่สองและใบแรกกินท้ายวันไปแล้ว ใบที่สองบังคับให้ไปต้นวัน
 */
function placeLeaveWindow(segments, minutes, punches, endOfDayTaken) {
  const dayStart = segments[0].start;
  const dayEnd = segments[segments.length - 1].end;
  const atStart = {
    start: dayStart,
    end: advanceFromStart(segments, dayStart, minutes),
    atEnd: false,
  };

  if (endOfDayTaken || punches.length === 0) return atStart;

  const first = punches[0];
  const last = punches[punches.length - 1];
  const lateMinutes = workingMinutesBetween(segments, dayStart, first);
  const earlyMinutes = workingMinutesBetween(segments, last, dayEnd);

  if (Math.abs(earlyMinutes - minutes) < Math.abs(lateMinutes - minutes)) {
    return {
      start: retreatFromEnd(segments, dayEnd, minutes),
      end: dayEnd,
      atEnd: true,
    };
  }

  return atStart;
}

function readRows(worksheet) {
  const rows = [];
  let currentCode = null;
  let currentName = '';

  for (let index = 3; index <= worksheet.rowCount; index += 1) {
    const row = worksheet.getRow(index);
    const employeeCell = cellText(row.getCell(COL.employee).value);
    const dateCell = cellText(row.getCell(COL.workDate).value);

    /* แถวคั่นชื่อคนเป็นเซลล์ผสานทั้งแถว ตัวอ่านจึงเห็นข้อความเดียวกันทุกคอลัมน์ */
    if (employeeCell && employeeCell === dateCell) {
      if (employeeCell.includes(' : ')) {
        const [code, rest] = employeeCell.split(' : ');
        currentCode = code.trim();
        currentName = (rest ?? '').split(' แผนก:')[0].trim();
      }
      continue;
    }

    const dateKey = parseFileDate(dateCell);
    if (!dateKey || !currentCode) continue;

    const punches = [];
    for (let col = COL.punchFirst; col <= COL.punchLast; col += 1) {
      const minutes = parseClockMinutes(cellText(row.getCell(col).value));
      if (minutes !== null) punches.push(minutes);
    }

    rows.push({
      rowNo: index,
      employeeCode: currentCode,
      employeeName: currentName,
      dateKey,
      dayStatus: cellText(row.getCell(COL.dayStatus).value),
      shift: cellText(row.getCell(COL.shift).value),
      punches,
      leaves: COL.leave
        .map((pair) => ({
          duration: cellText(row.getCell(pair.duration).value),
          typeName: cellText(row.getCell(pair.type).value),
        }))
        .filter((item) => item.duration || item.typeName),
      overtimes: [
        { duration: cellText(row.getCell(COL.otNormal).value), label: 'โอทีล่วงเวลา (x1.0)' },
        {
          duration: cellText(row.getCell(COL.otHoliday).value),
          label: 'โอทีล่วงเวลาวันหยุด (x1.5)',
        },
      ].filter((item) => item.duration),
      absent: cellText(row.getCell(COL.absent).value),
      note: cellText(row.getCell(COL.note).value),
    });
  }

  return rows;
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const fromArg = (args.find((arg) => arg.startsWith('--from=')) || '').slice(7);
  const toArg = (args.find((arg) => arg.startsWith('--to=')) || '').slice(5);
  const filePathArg = args.find((arg) => !arg.startsWith('--'));

  if (!filePathArg) fail('ต้องระบุไฟล์ที่จะนำเข้า');

  const sourcePath = resolve(filePathArg);
  if (!existsSync(sourcePath)) fail(`ไม่พบไฟล์ ${sourcePath}`);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(sourcePath);
  const worksheet = workbook.worksheets[0];

  const rows = readRows(worksheet).filter(
    (row) => (!fromArg || row.dateKey >= fromArg) && (!toArg || row.dateKey <= toArg),
  );

  if (rows.length === 0) fail('ไม่มีแถวข้อมูลในช่วงวันที่ที่เลือก');

  const dateKeys = rows.map((row) => row.dateKey).sort();
  const firstDate = dateKeys[0];
  const lastDate = dateKeys[dateKeys.length - 1];

  /*
   * งวดตั้งชื่อตามเดือนของวันสุดท้าย เช่น 2026-09-25 -> 2609
   *
   * ใส่ --tag=xxxx ทับได้ ใช้ตอนที่รหัสงวดชนกับของที่เคยนำเข้าไว้แล้ว
   * (ไฟล์คนละงวดอาจได้รหัสเดียวกัน เช่น ไฟล์ 26/06-25/07 กับเศษต้นงวด ส.ค.
   *  ที่มีวันในเดือน ก.ค. ทั้งคู่ได้ 2607 แล้วเลขที่ใบชนกันกลางคัน)
   */
  const tagArg = (args.find((arg) => arg.startsWith('--tag=')) || '').slice(6);
  const periodTag = tagArg || `${lastDate.slice(2, 4)}${lastDate.slice(5, 7)}`;
  const leavePrefix = `LV-IMP-${periodTag}`;
  const otPrefix = `OT-IMP-${periodTag}`;
  const reason = `นำเข้าจากรายงานตารางเวลาการทำงาน ${lastDate.slice(0, 7)}`;

  const prisma = new PrismaClient();

  try {
    const employees = await prisma.employee.findMany({
      where: { companyId: COMPANY_ID, deletedAt: null },
      select: { id: true, employeeCode: true },
    });
    const employeeByCode = new Map(
      employees.map((employee) => [employee.employeeCode, employee.id]),
    );

    const leaveTypes = await prisma.leaveType.findMany({
      where: { companyId: COMPANY_ID, deletedAt: null },
      select: { id: true, code: true },
    });
    const leaveTypeByCode = new Map(leaveTypes.map((type) => [type.code, type.id]));

    const problems = [];
    const leaveDrafts = [];
    const otDrafts = [];
    const reportOnly = { absent: [], notes: [] };

    for (const row of rows) {
      const employeeId = employeeByCode.get(row.employeeCode);
      const segments = segmentsOf(row.shift);
      const fullDayMinutes = workingMinutesTotal(segments);
      const isHoliday = row.dayStatus === HOLIDAY_STATUS;
      const label = `แถว ${row.rowNo} · ${row.employeeCode} ${row.dateKey}`;

      if (!employeeId && (row.leaves.length || row.overtimes.length)) {
        problems.push(`${label}: ไม่พบพนักงานรหัสนี้ในบริษัท`);
        continue;
      }

      let endOfDayTaken = false;

      for (const leave of row.leaves) {
        const minutes = parseDurationMinutes(leave.duration);
        const typeCode = LEAVE_TYPE_BY_NAME[leave.typeName];

        if (!typeCode) {
          problems.push(`${label}: ไม่รู้จักประเภทการลา "${leave.typeName}"`);
          continue;
        }

        const leaveTypeId = leaveTypeByCode.get(typeCode);
        if (!leaveTypeId) {
          problems.push(`${label}: ไม่มีประเภทการลา ${typeCode} ในระบบ`);
          continue;
        }

        if (minutes === null || minutes <= 0) {
          problems.push(
            `${label}: ${leave.typeName} แต่จำนวนเวลาเป็น "${leave.duration}" — ข้ามใบนี้`,
          );
          continue;
        }

        if (minutes >= fullDayMinutes) {
          leaveDrafts.push({
            row,
            employeeId,
            leaveTypeId,
            typeName: leave.typeName,
            dayType: 'FULL_DAY',
            totalDays: 1,
            totalMinutes: fullDayMinutes,
            startTime: null,
            endTime: null,
          });
          continue;
        }

        const window = placeLeaveWindow(segments, minutes, row.punches, endOfDayTaken);
        endOfDayTaken = endOfDayTaken || window.atEnd;

        const isHalfDay = minutes * 2 === fullDayMinutes;
        const dayType = isHalfDay
          ? window.atEnd
            ? 'HALF_DAY_AFTERNOON'
            : 'HALF_DAY_MORNING'
          : 'HOURLY';

        leaveDrafts.push({
          row,
          employeeId,
          leaveTypeId,
          typeName: leave.typeName,
          dayType,
          totalDays: Math.round((minutes / fullDayMinutes) * 100) / 100,
          totalMinutes: minutes,
          startTime: formatClock(window.start),
          endTime: formatClock(window.end),
        });
      }

      for (const overtime of row.overtimes) {
        const minutes = parseDurationMinutes(overtime.duration);

        if (minutes === null || minutes <= 0) {
          problems.push(`${label}: อ่านเวลาโอที "${overtime.duration}" ไม่ออก`);
          continue;
        }

        /*
         * ไฟล์บอกแค่จำนวนชั่วโมง ไม่บอกช่วงเวลา
         * วันทำงานจึงวางต่อท้ายเวลาเลิกงาน ส่วนวันหยุดเริ่มนับจากรอยแตะบัตรแรก
         * (ไม่มีรอยก็เริ่มที่เวลาเข้างานปกติ) — ตัวคำนวณใช้แต่จำนวนชั่วโมง
         * ช่วงเวลามีไว้ให้คนอ่านเข้าใจว่าโอทีก้อนนี้มาจากตรงไหนของวัน
         */
        const startMinutes = isHoliday
          ? row.punches[0] ?? segments[0].start
          : segments[segments.length - 1].end;

        otDrafts.push({
          row,
          employeeId,
          minutes,
          /*
           * ประเภทโอทีต้องดูว่าชั่วโมงมาจากช่องไหนของไฟล์ ไม่ใช่ดูว่าวันนั้นเป็นวันหยุด
           *
           * ไฟล์แยกช่อง "โอทีล่วงเวลา(x1.0)" กับ "โอทีล่วงเวลาวันหยุด(x1.5)" ไว้แล้ว
           * ระบบเดิมจ่ายตามช่องนั้นตรง ๆ เคยตั้งจากสถานะวันหยุด ทำให้ชั่วโมงที่ไฟล์
           * จ่าย x1.0 ถูกยกไปคิด x1.5 (งวด ม.ค. คนเดียวกันต่างกันหลายร้อยบาท)
           */
          workType: overtime.label.includes('x1.5') ? 'HOLIDAY' : 'WORKDAY',
          startMinutes,
          endMinutes: startMinutes + minutes,
          label: overtime.label,
        });
      }

      if (row.absent) {
        reportOnly.absent.push(`${row.employeeCode} ${row.dateKey} · ${row.absent}`);
      }
      if (row.note) {
        reportOnly.notes.push(`${row.employeeCode} ${row.dateKey} · ${row.note}`);
      }
    }

    console.log('\n=== ไฟล์ ===');
    console.log(`ชื่อไฟล์  : ${basename(sourcePath)}`);
    console.log(`ช่วงวันที่ : ${firstDate} ถึง ${lastDate}`);
    console.log(`แถววันที่ : ${rows.length}`);

    const leaveByType = {};
    for (const draft of leaveDrafts) {
      const key = `${draft.typeName} · ${draft.dayType}`;
      leaveByType[key] = (leaveByType[key] ?? 0) + 1;
    }

    console.log(`\n=== ใบลาที่จะเขียน (${leaveDrafts.length} ใบ) ===`);
    for (const [key, count] of Object.entries(leaveByType).sort()) {
      console.log(`  ${key}: ${count}`);
    }

    const otMinutes = otDrafts.reduce((sum, draft) => sum + draft.minutes, 0);
    const otHoliday = otDrafts.filter((draft) => draft.workType === 'HOLIDAY').length;
    console.log(
      `\n=== ใบโอทีที่จะเขียน (${otDrafts.length} ใบ) ===\n` +
        `  รวม ${(otMinutes / 60).toFixed(2)} ชั่วโมง · วันหยุด ${otHoliday} ใบ`,
    );

    console.log('\n=== ไม่นำเข้า ให้ระบบคำนวณเอง ===');
    console.log(`  ขาดงานในไฟล์ : ${reportOnly.absent.length} รายการ`);
    for (const item of reportOnly.absent) console.log(`    ${item}`);
    console.log(`  หมายเหตุ     : ${reportOnly.notes.length} รายการ`);
    for (const item of reportOnly.notes) console.log(`    ${item}`);

    if (problems.length) {
      console.log(`\n=== แถวที่มีปัญหา (${problems.length}) ===`);
      for (const item of problems) console.log(`  ${item}`);
    }

    /* --all = พิมพ์ทุกใบ ไว้ตรวจว่าเดาช่วงเวลาลาถูกไหมก่อนเขียนจริง */
    const showAll = args.includes('--all');
    const shown = showAll ? leaveDrafts : leaveDrafts.slice(0, 12);

    console.log(`\n=== ใบลา (${showAll ? 'ทั้งหมด' : '12 ใบแรก'}) ===`);
    for (const draft of shown) {
      console.log(
        `  ${draft.row.employeeCode} ${draft.row.dateKey} · ${draft.typeName}` +
          ` · ${draft.dayType} · ${draft.totalMinutes} นาที` +
          ` · ${draft.startTime ?? '-'}-${draft.endTime ?? '-'}` +
          ` · แตะบัตร ${draft.row.punches.map(formatClock).join(' ') || '(ไม่มี)'}`,
      );
    }

    if (!apply) {
      console.log('\n-- พรีวิวเท่านั้น ยังไม่ได้เขียนข้อมูล ใส่ --apply เพื่อเขียนจริง --\n');
      return;
    }

    const now = new Date();
    const rangeFrom = dateOnly(firstDate);
    const rangeTo = dateOnly(lastDate);

    const removedLeaves = await prisma.leaveRequest.deleteMany({
      where: {
        requestNo: { startsWith: leavePrefix },
        startDate: { gte: rangeFrom, lte: rangeTo },
      },
    });
    const removedOts = await prisma.overtimeRequest.deleteMany({
      where: {
        requestNo: { startsWith: otPrefix },
        workDate: { gte: rangeFrom, lte: rangeTo },
      },
    });

    console.log('\n=== กำลังเขียนข้อมูล ===');
    console.log(
      `ลบของนำเข้ารอบก่อน: ใบลา ${removedLeaves.count} · ใบโอที ${removedOts.count}`,
    );

    let leaveSeq = 0;
    for (const draft of leaveDrafts) {
      leaveSeq += 1;
      const workDate = dateOnly(draft.row.dateKey);

      await prisma.leaveRequest.create({
        data: {
          requestNo: `${leavePrefix}-${String(leaveSeq).padStart(4, '0')}`,
          employeeId: draft.employeeId,
          leaveTypeId: draft.leaveTypeId,
          startDate: workDate,
          endDate: workDate,
          dayType: draft.dayType,
          totalDays: draft.totalDays,
          totalMinutes: draft.totalMinutes,
          startTime: draft.startTime,
          endTime: draft.endTime,
          reason,
          note: `${draft.typeName} ${draft.row.dateKey} (กะ ${draft.row.shift})`,
          status: 'APPROVED',
          submittedAt: now,
          approvedAt: now,
          submittedById: ACTOR_USER_ID,
        },
      });
    }

    let otSeq = 0;
    for (const draft of otDrafts) {
      otSeq += 1;

      await prisma.overtimeRequest.create({
        data: {
          requestNo: `${otPrefix}-${String(otSeq).padStart(4, '0')}`,
          employeeId: draft.employeeId,
          workDate: dateOnly(draft.row.dateKey),
          startTime: bangkokDateTime(draft.row.dateKey, draft.startMinutes),
          endTime: bangkokDateTime(draft.row.dateKey, draft.endMinutes),
          breakMinutes: 0,
          totalHours: Math.round((draft.minutes / 60) * 100) / 100,
          workType: draft.workType,
          reason,
          note: `${draft.label} ${draft.row.dateKey}`,
          status: 'APPROVED',
          submittedAt: now,
          approvedAt: now,
          submittedById: ACTOR_USER_ID,
        },
      });
    }

    console.log(`เขียนใบลา ${leaveSeq} ใบ · ใบโอที ${otSeq} ใบ`);
    console.log(
      '\nต่อไปสั่งคำนวณสรุปเวลารายวันใหม่ทั้งช่วง ยอดถึงจะขยับ:\n' +
        `  node scripts/recalc-attendance-range.js ${firstDate} ${lastDate}\n`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
