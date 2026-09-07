/*
 * นำเข้าไฟล์รายงานตารางเวลาการทำงานของระบบเดิม
 *
 * รันจากโค้ดที่ build แล้ว (dist) เพราะ Nest ต้องใช้ decorator metadata
 * ซึ่ง tsx ไม่ปล่อยออกมา และ ts-node แบบ CommonJS โหลด Prisma client ที่เป็น ESM ไม่ได้
 *
 * ใช้ AttendanceImportDataset ตัวเดียวกับที่หน้าเว็บใช้ กติกาจึงเหมือนกันทุกอย่าง:
 * ครั้งแรก = เข้าเช้า, ครั้งสุดท้าย = ออกงาน, ข้ามวันที่ไม่มีการแตะบัตร,
 * ลบเฉพาะ log ที่ source=IMPORT ของวันเดียวกันก่อนเขียนใหม่ (นำเข้าซ้ำได้)
 *
 *   node scripts/import-timesheet-file.js "<ไฟล์.xlsx>"           พรีวิว
 *   node scripts/import-timesheet-file.js "<ไฟล์.xlsx>" --apply   เขียนจริง
 */
require('reflect-metadata');
require('dotenv').config({ quiet: true });

const { existsSync } = require('fs');
const { basename, resolve } = require('path');
const { NestFactory } = require('@nestjs/core');

const {
  AttendanceImportDataset,
} = require('../dist/modules/data-import/datasets/attendance-import.dataset');
const { AppModule } = require('../dist/app.module');
const {
  readSheetGrid,
} = require('../dist/modules/data-import/utils/excel-sheet.util');
const {
  buildAutoMapping,
  detectHeaderRowIndex,
} = require('../dist/modules/data-import/utils/data-import-mapping.util');

const COMPANY_ID = process.env.IMPORT_COMPANY_ID || 'cmstqxdhf004ttm7wqvoaszwq';
const ACTOR_USER_ID = process.env.IMPORT_ACTOR_ID || 'cmso9a51300sbtmesx37xlexo';

function fail(message) {
  console.error(`\nERROR: ${message}\n`);
  process.exit(1);
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const filePathArg = args.find((arg) => !arg.startsWith('--'));

  if (!filePathArg) fail('ต้องระบุไฟล์ที่จะนำเข้า');

  const sourcePath = resolve(filePathArg);
  if (!existsSync(sourcePath)) fail(`ไม่พบไฟล์ ${sourcePath}`);

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });

  try {
    const dataset = app.get(AttendanceImportDataset);

    const grid = await readSheetGrid(sourcePath);
    if (grid.rows.length === 0) fail('ไฟล์นี้ไม่มีข้อมูลในชีต');

    const headerRowIndex = detectHeaderRowIndex(grid.rows, dataset.fields);
    const headerRow = grid.rows[headerRowIndex] || [];
    const mapping = buildAutoMapping(headerRow, dataset.fields);

    console.log('\n=== ไฟล์ ===');
    console.log(`ชื่อไฟล์    : ${basename(sourcePath)}`);
    console.log(`ชีต         : ${grid.sheetName}`);
    console.log(`จำนวนแถว    : ${grid.rows.length}`);
    console.log(`แถวหัวตาราง : ${headerRowIndex + 1}`);
    console.log('\n=== การจับคู่คอลัมน์ ===');
    console.log(JSON.stringify(mapping));

    const unmapped = dataset.fields
      .filter((field) => field.required && mapping[field.key] == null)
      .map((field) => field.label);
    if (unmapped.length) fail(`จับคู่คอลัมน์ที่จำเป็นไม่ได้: ${unmapped.join(', ')}`);

    const rows = await dataset.prepare({
      rows: grid.rows,
      headerRowIndex,
      mapping,
      duplicateMode: 'UPDATE',
      companyId: COMPANY_ID,
    });

    const errorRows = rows.filter((row) => row.errors && row.errors.length);
    const skipRows = rows.filter((row) => row.action === 'SKIP');
    const writeRows = rows.filter(
      (row) => !(row.errors && row.errors.length) && row.action !== 'SKIP',
    );
    const warnRows = rows.filter((row) => row.warnings && row.warnings.length);

    console.log('\n=== สรุปแถว ===');
    console.log(`อ่านได้ทั้งหมด         : ${rows.length}`);
    console.log(`จะเขียนข้อมูล          : ${writeRows.length}`);
    console.log(`ข้าม (ไม่มีการแตะบัตร) : ${skipRows.length}`);
    console.log(`มีปัญหา                : ${errorRows.length}`);
    console.log(`มีคำเตือน              : ${warnRows.length}`);

    const dates = writeRows.map((row) => row.payload && row.payload.workDate).filter(Boolean).sort();
    if (dates.length) {
      console.log(`ช่วงวันที่             : ${dates[0]} ถึง ${dates[dates.length - 1]}`);
      const people = new Set(writeRows.map((row) => row.payload.employeeCode));
      console.log(`จำนวนพนักงาน           : ${people.size} คน`);
      const punches = writeRows.reduce((sum, row) => sum + row.payload.punches.length, 0);
      console.log(`รอยแตะบัตรที่จะเขียน   : ${punches} รายการ`);
    }

    if (errorRows.length) {
      console.log('\n=== แถวที่มีปัญหา (15 แถวแรก) ===');
      for (const row of errorRows.slice(0, 15)) {
        console.log(`  แถว ${row.rowNo} · ${row.title}: ${row.errors.join(' | ')}`);
      }
    }

    if (warnRows.length) {
      console.log(`\n=== คำเตือน (8 แถวแรก จาก ${warnRows.length}) ===`);
      for (const row of warnRows.slice(0, 8)) {
        console.log(`  แถว ${row.rowNo} · ${row.title}: ${row.warnings.join(' | ')}`);
      }
    }

    if (writeRows.length) {
      console.log('\n=== ตัวอย่างแถวที่จะเขียน (5 แถวแรก) ===');
      for (const row of writeRows.slice(0, 5)) {
        const punches = row.payload.punches
          .map((punch) => `${punch.session} ${punch.time}`)
          .join(', ');
        console.log(`  ${row.title} -> ${punches}`);
      }
    }

    if (!apply) {
      console.log('\n-- พรีวิวเท่านั้น ยังไม่ได้เขียนข้อมูล ใส่ --apply เพื่อเขียนจริง --\n');
      return;
    }

    if (errorRows.length) fail('ยังมีแถวที่อ่านไม่ผ่าน แก้ไฟล์ก่อนแล้วค่อยนำเข้า');

    console.log('\n=== กำลังเขียนข้อมูล ===');
    let done = 0;
    const failures = [];

    for (const row of writeRows) {
      try {
        await dataset.commitRow({ row, actorId: ACTOR_USER_ID });
        done += 1;
        if (done % 200 === 0) console.log(`  เขียนแล้ว ${done}/${writeRows.length}`);
      } catch (error) {
        failures.push(`แถว ${row.rowNo} · ${row.title}: ${error.message}`);
      }
    }

    console.log(`\nเขียนสำเร็จ ${done}/${writeRows.length} แถว`);
    if (failures.length) {
      console.log(`\n=== แถวที่เขียนไม่สำเร็จ (${failures.length}) ===`);
      for (const message of failures.slice(0, 20)) console.log(`  ${message}`);
    }
    console.log('\nนำเข้าเสร็จแล้ว — ระบบทยอยคำนวณสรุปเวลารายวันใหม่ให้เอง\n');
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
