import ExcelJS from 'exceljs';

import type { WorkmenCompensationReport } from './services/payroll-workmen-compensation.service';

/**
 * แบบคำนวณค่าจ้าง กท.20 ในรูป Excel
 * -----------------------------------------------------------------------------
 * วางตามไฟล์ตัวอย่างที่ลูกค้าใช้อยู่จริง — ชีตเดียวตั้งชื่อตามลำดับที่สาขา
 * เนื้อหาเรียงเหมือน PDF ทุกบรรทัด เพื่อให้เทียบกันได้ตรงและแก้ต่อในตารางได้
 *
 * ตัวเลขลงเป็นตัวเลขจริงไม่ใช่ข้อความ คนใช้จะได้คำนวณต่อในชีตได้ทันที
 */

const MONEY = '#,##0.00';
const RULE = 'FF000000';

function border(): Partial<ExcelJS.Borders> {
  const line = { style: 'thin' as const, color: { argb: RULE } };
  return { top: line, left: line, bottom: line, right: line };
}

function sheetName(report: WorkmenCompensationReport) {
  const digits = (report.company.socialSecurityBranchNo ?? '').replace(
    /\D/g,
    '',
  );

  return digits || '000000';
}

/** ผสานช่วงคอลัมน์ในแถวเดียว แล้วใส่ข้อความ */
function mergeText(
  sheet: ExcelJS.Worksheet,
  row: number,
  from: number,
  to: number,
  text: string,
  options: Partial<ExcelJS.Alignment> = {},
) {
  sheet.mergeCells(row, from, row, to);
  const cell = sheet.getCell(row, from);
  cell.value = text;
  cell.alignment = { vertical: 'middle', wrapText: true, ...options };
  return cell;
}

export async function generateWorkmenFormXlsx(
  report: WorkmenCompensationReport,
) {
  const workbook = new ExcelJS.Workbook();

  workbook.creator = 'HR Workforce Management System';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(sheetName(report));

  sheet.columns = [
    { width: 10 }, // เดือน
    { width: 11 }, // จำนวนลูกจ้าง
    { width: 16 }, // เงินเดือน
    { width: 15 }, // ค่าจ้างรายวัน
    { width: 14 }, // เงินได้อื่นๆ
    { width: 16 }, // (1) รวมค่าจ้าง
    { width: 17 }, // (2) ส่วนเกิน
    { width: 17 }, // (3) สุทธิ
  ];

  const { company, totals, lowest, annualTaxSummary } = report;

  /* ---------- หัวเรื่อง ---------- */

  mergeText(
    sheet,
    1,
    1,
    8,
    'โปรดกรอกเอกสารฉบับนี้และส่งคืนสำนักงานพร้อมแบบ กท. 20 ก',
    { horizontal: 'center' },
  ).font = { bold: true, underline: true };

  mergeText(
    sheet,
    2,
    1,
    8,
    `แบบคำนวณค่าจ้างเพื่อประกอบการรายงานค่าจ้างตามแบบ กท. 20 ก ประจำปี ${report.buddhistYear}`,
    { horizontal: 'center' },
  );

  mergeText(sheet, 3, 1, 5, 'สำนักงานประกันสังคมจังหวัด ');
  mergeText(sheet, 3, 6, 8, 'โทร. ');

  mergeText(sheet, 4, 1, 5, `ชื่อสถานประกอบการ ${company.nameTh ?? ''}`);
  mergeText(
    sheet,
    4,
    6,
    8,
    `เลขที่บัญชี ${company.socialSecurityAccountNo ?? ''}`,
  );

  mergeText(
    sheet,
    5,
    1,
    2,
    `(ก) รหัสกิจการ ${company.workmenCompensationCode ?? ''}`,
  );
  mergeText(
    sheet,
    5,
    3,
    5,
    `อัตราเงินสมทบ ${company.workmenCompensationRate ?? ''}`,
  );
  mergeText(sheet, 5, 6, 8, `โทร. ${company.phone ?? ''}`);

  /* ---------- หัวตาราง 3 แถวซ้อน ---------- */

  sheet.mergeCells(6, 1, 8, 1);
  sheet.getCell(6, 1).value = 'เดือน';

  sheet.mergeCells(6, 2, 8, 2);
  sheet.getCell(6, 2).value = 'จำนวน\nลูกจ้าง';

  mergeText(
    sheet,
    6,
    3,
    6,
    '(ข) ประเภทของค่าจ้างตามกฎหมาย (รวมทุกสาขา)',
    { horizontal: 'center' },
  );

  sheet.mergeCells(6, 7, 8, 7);
  sheet.getCell(6, 7).value =
    '(2)\nส่วนที่เกิน\n20,000/คน/เดือน\n(รวมของทุกคน)';

  sheet.mergeCells(6, 8, 8, 8);
  sheet.getCell(6, 8).value = '(1) - (2) = (3)\nค่าจ้างสุทธิ\nที่ต้องแจ้ง';

  ['เงินเดือน', 'ค่าจ้างรายวัน', 'เงินได้อื่นๆ'].forEach((text, index) => {
    sheet.getCell(7, index + 3).value = text;
  });
  sheet.getCell(7, 6).value = '(1)\nรวมค่าจ้าง';

  mergeText(
    sheet,
    8,
    3,
    5,
    '** ไม่รวมเงินที่ไม่ใช่ค่าจ้าง เช่น ค่าล่วงเวลา โบนัส ฯลฯ**',
    { horizontal: 'center' },
  );
  sheet.mergeCells(7, 6, 8, 6);

  for (let row = 6; row <= 8; row++) {
    for (let col = 1; col <= 8; col++) {
      const cell = sheet.getCell(row, col);
      cell.border = border();
      cell.alignment = {
        vertical: 'middle',
        horizontal: 'center',
        wrapText: true,
      };
    }
  }

  /* ---------- 12 เดือน ---------- */

  let cursor = 9;

  for (const month of report.months) {
    const values = [
      month.monthLabel,
      month.employeeCount,
      month.monthlySalary,
      month.dailyWage,
      month.otherIncome,
      month.totalWage,
      month.excessOverCap,
      month.netWage,
    ];

    values.forEach((value, index) => {
      const cell = sheet.getCell(cursor, index + 1);
      cell.value = value;
      cell.border = border();

      if (index === 0) cell.alignment = { horizontal: 'center' };
      else if (index === 1) cell.alignment = { horizontal: 'right' };
      else {
        cell.alignment = { horizontal: 'right' };
        cell.numFmt = MONEY;
      }
    });

    cursor += 1;
  }

  /* ---------- แถวรวม ---------- */

  mergeText(sheet, cursor, 1, 2, 'รวม', { horizontal: 'center' });

  [
    totals.monthlySalary,
    totals.dailyWage,
    totals.otherIncome,
    totals.totalWage,
    totals.excessOverCap,
    totals.netWage,
  ].forEach((value, index) => {
    const cell = sheet.getCell(cursor, index + 3);
    cell.value = value;
    cell.numFmt = MONEY;
    cell.alignment = { horizontal: 'right' };
    cell.border = border();
  });

  sheet.getCell(cursor, 1).border = border();
  sheet.getCell(cursor, 2).border = border();

  const totalRow = cursor;
  cursor += 1;

  /* ---------- (ง) ค่าจ้างต่ำสุด ---------- */

  mergeText(
    sheet,
    cursor,
    1,
    8,
    `(ง) ค่าจ้างรายเดือนของลูกจ้างที่ได้รับต่ำสุด เดือนละ ${lowest.monthlySalary} บาท ` +
      `ค่าจ้างรายวันของลูกจ้างที่ได้รับต่ำสุดวันละ ${lowest.dailyWage} บาท`,
  );
  cursor += 1;

  /* ---------- (จ) ยอดตาม ภ.ง.ด.1ก ---------- */

  mergeText(
    sheet,
    cursor,
    1,
    5,
    '(จ) รายการเงินได้ตามแบบยื่นรายการภาษีเงินได้หัก ณ ที่จ่าย ภงด. 1 ก',
  );
  mergeText(sheet, cursor, 6, 8, 'ลงชื่อ                          นายจ้าง');
  cursor += 1;

  sheet.getCell(cursor, 1).value = 'จำนวน';
  sheet.getCell(cursor, 2).value = `${annualTaxSummary.employeeCount} ราย`;
  sheet.getCell(cursor, 3).value = 'เงินได้ทั้งสิ้น';
  sheet.getCell(cursor, 5).value = annualTaxSummary.totalIncome;
  sheet.getCell(cursor, 5).numFmt = MONEY;
  mergeText(sheet, cursor, 6, 8, '(                          )');
  cursor += 1;

  sheet.getCell(cursor, 1).value = 'ประกอบด้วย';
  sheet.getCell(cursor, 2).value = 'เงินเดือน';
  sheet.getCell(cursor, 5).value = annualTaxSummary.monthlySalary;
  sheet.getCell(cursor, 5).numFmt = MONEY;
  mergeText(sheet, cursor, 6, 8, 'ตำแหน่ง');
  cursor += 1;

  sheet.getCell(cursor, 1).value = 'ค่าจ้างรายวัน';
  sheet.getCell(cursor, 2).value = annualTaxSummary.dailyWage;
  sheet.getCell(cursor, 2).numFmt = MONEY;
  sheet.getCell(cursor, 3).value = 'เงินได้อื่นๆ';
  sheet.getCell(cursor, 5).value = annualTaxSummary.otherIncome;
  sheet.getCell(cursor, 5).numFmt = MONEY;
  cursor += 1;

  sheet.getCell(cursor, 1).value = 'ค่าล่วงเวลา';
  sheet.getCell(cursor, 2).value = annualTaxSummary.overtime;
  sheet.getCell(cursor, 2).numFmt = MONEY;
  cursor += 2;

  /* ---------- กล่องเจ้าหน้าที่ ---------- */

  mergeText(sheet, cursor, 1, 2, `ประจำปี ${report.buddhistYear}`);
  mergeText(
    sheet,
    cursor,
    3,
    6,
    'รหัสกิจการ ............................. อัตราเงินสมทบ .........................................',
  );
  mergeText(sheet, cursor, 7, 8, 'สำหรับเจ้าหน้าที่', {
    horizontal: 'right',
  }).font = { bold: true };
  cursor += 1;

  const officerHeads = [
    'ประเภท',
    'ค่าจ้าง',
    'ปรับขั้นต่ำ (เฉพาะลูกจ้าง 1 คน)',
    'ค่าจ้างสุทธิ',
    'เงินสมทบ',
  ];

  officerHeads.forEach((text, index) => {
    const cell = sheet.getCell(cursor, index + 1);
    cell.value = text;
    cell.border = border();
    cell.alignment = { horizontal: 'center', wrapText: true };
  });
  cursor += 1;

  for (const label of ['การประเมินต้นปี', 'การรายงานค่าจ้าง', 'สปส 1-10']) {
    sheet.getCell(cursor, 1).value = label;
    for (let col = 1; col <= 5; col++) {
      sheet.getCell(cursor, col).border = border();
    }
    cursor += 1;
  }

  mergeText(
    sheet,
    cursor,
    1,
    8,
    ' กองทุนเงินทดแทน  สรุปผลเป็น  เรียกเพิ่ม (Dr.), จ่ายคืน (Cr.)',
  );

  /* ตรึงหัวตารางไว้ เวลาเลื่อนดู 12 เดือนจะได้รู้ว่าคอลัมน์ไหนคืออะไร */
  sheet.views = [{ state: 'frozen', ySplit: 8 }];
  sheet.getRow(totalRow).font = { bold: true };

  const buffer = await workbook.xlsx.writeBuffer();

  return {
    buffer: Buffer.from(buffer),
    fileName: `kt-20-${report.buddhistYear}.xlsx`,
    mimeType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
}
