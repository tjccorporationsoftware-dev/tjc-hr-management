import ExcelJS from 'exceljs';

import type { Pnd1Form } from './utils/payroll-pnd1-form.util';

/**
 * แบบ ภ.ง.ด.1 ในรูป Excel
 * -----------------------------------------------------------------------------
 * วางตามไฟล์ตัวอย่างของลูกค้า — ชีตเดียวตั้งชื่อตามเลขสาขา 6 คอลัมน์
 *
 *   ลำดับ · เลขบัตรประจำตัวประชาชน · ชื่อ-นามสกุล · วัน/เดือน/ปี · จำนวนเงินได้ · ภาษีที่ต้องหัก
 *
 * เลขบัตรประชาชนต้องลงเป็น **ข้อความ** ไม่ใช่ตัวเลข ไม่งั้น Excel แสดงเป็น
 * 1.3499E+12 และศูนย์นำหน้าหายไปด้วย
 */

const MONEY = '#,##0.00';

const HEADERS = [
  'ลำดับ',
  'เลขบัตรประจำตัวประชาชน',
  'ชื่อ-นามสกุล',
  'วัน/เดือน/ปี',
  'จำนวนเงินได้',
  'ภาษีที่ต้องหัก',
];

const WIDTHS = [8, 24, 34, 14, 16, 16];

function border(): Partial<ExcelJS.Borders> {
  const line = { style: 'thin' as const, color: { argb: 'FF000000' } };
  return { top: line, left: line, bottom: line, right: line };
}

export async function generatePnd1FormXlsx(form: Pnd1Form) {
  const workbook = new ExcelJS.Workbook();

  workbook.creator = 'HR Workforce Management System';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(form.company.branchNo || '00000');
  sheet.columns = WIDTHS.map((width) => ({ width }));

  const head = sheet.getRow(1);
  HEADERS.forEach((text, index) => {
    const cell = head.getCell(index + 1);
    cell.value = text;
    cell.font = { bold: true };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = border();
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF2F2F2' },
    };
  });
  head.commit();

  form.rows.forEach((person, index) => {
    const row = sheet.getRow(index + 2);
    const fullName = [person.title, person.firstName, person.lastName]
      .filter(Boolean)
      .join(' ');

    row.getCell(1).value = person.sequence;
    row.getCell(1).alignment = { horizontal: 'center' };

    /* เขียนเป็นข้อความชัดเจน กัน Excel แปลงเลข 13 หลักเป็นตัวเลขวิทยาศาสตร์ */
    const idCell = row.getCell(2);
    idCell.value = person.identityNo;
    idCell.numFmt = '@';
    idCell.alignment = { horizontal: 'left' };

    row.getCell(3).value = fullName;
    row.getCell(4).value = person.paidOnText;
    row.getCell(4).alignment = { horizontal: 'center' };

    row.getCell(5).value = person.paidAmount;
    row.getCell(5).numFmt = MONEY;

    row.getCell(6).value = person.taxWithheld;
    row.getCell(6).numFmt = MONEY;

    for (let column = 1; column <= 6; column += 1) {
      row.getCell(column).border = border();
    }

    /* คนที่ข้อมูลไม่ครบให้เห็นตั้งแต่เปิดไฟล์ ไม่ต้องไปไล่หาทีหลัง */
    if (person.missing.length > 0) {
      for (let column = 1; column <= 6; column += 1) {
        row.getCell(column).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFFF3CD' },
        };
      }
      row.getCell(3).note = `ยังขาด: ${person.missing.join(' · ')}`;
    }

    row.commit();
  });

  const totalRowNo = form.rows.length + 2;
  const totalRow = sheet.getRow(totalRowNo);

  sheet.mergeCells(totalRowNo, 1, totalRowNo, 4);
  const label = totalRow.getCell(1);
  label.value = `รวม ${form.totals.count} ราย`;
  label.font = { bold: true };
  label.alignment = { horizontal: 'left', vertical: 'middle' };

  totalRow.getCell(5).value = form.totals.paidAmount;
  totalRow.getCell(5).numFmt = MONEY;
  totalRow.getCell(5).font = { bold: true };

  totalRow.getCell(6).value = form.totals.taxWithheld;
  totalRow.getCell(6).numFmt = MONEY;
  totalRow.getCell(6).font = { bold: true };

  for (let column = 1; column <= 6; column += 1) {
    totalRow.getCell(column).border = border();
  }
  totalRow.commit();

  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const monthPart = String(form.month).padStart(2, '0');

  return {
    buffer,
    fileName: `pnd1-${form.gregorianYear}-${monthPart}.xlsx`,
    mimeType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
}
