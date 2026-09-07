import ExcelJS from 'exceljs';

import type { WorkmenCompensationReport } from './services/payroll-workmen-compensation.service';

/**
 * รายงานกองทุนเงินทดแทนประจำปี (กท.20ก) ในรูป Excel
 * -----------------------------------------------------------------------------
 * เป็นรายชื่อลูกจ้างรายคนที่แนบไปกับแบบ กท.20 — วางคอลัมน์ตามไฟล์ตัวอย่างของ
 * ลูกค้าเป๊ะ ๆ เพื่อให้เทียบกับของระบบเดิมได้ทีละบรรทัด
 *
 * ยอดรวมของคอลัมน์ "ค่าจ้างที่ต้องแจ้ง" ต้องเท่ากับช่อง (ค) ของแบบ กท.20 พอดี
 * ถ้าไม่เท่าแปลว่าการตัดเพดานรายเดือนสองที่คิดคนละแบบ
 *
 * ไฟล์ตัวอย่างใส่เลขเดียวกันทั้งช่อง "รายได้ทั้งปี" และ "ค่าจ้างที่ต้องแจ้ง"
 * (พิสูจน์ได้จากผลรวมสองคอลัมน์ที่เท่ากันและเท่ากับช่อง (ค) ซึ่งเป็นยอดหลังตัด
 * เพดานแล้ว) จึงทำตามนั้น ไม่ใส่ยอดก่อนตัดเพดานลงไปให้ต่างจากของเดิม
 */

const MONEY = '#,##0.00';
const RULE = 'FF000000';

const HEADERS = [
  'ชื่อ-นามสกุล',
  'บริษัท',
  'สำนักงานสาขา',
  'แผนก',
  'ฝ่ายงาน',
  'หน่วยงาน',
  'ตำแหน่ง',
  'ประเภทพนักงาน',
  'รายได้ทั้งปี',
  'ค่าจ้างที่ต้องแจ้ง',
];

/** ความกว้างคอลัมน์ตามไฟล์ตัวอย่าง เพื่อให้เปิดมาแล้วหน้าตาเหมือนกัน */
const WIDTHS = [52, 56, 68, 32, 12, 14, 51, 27, 21, 30];

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

export async function generateWorkmenAnnualXlsx(
  report: WorkmenCompensationReport,
) {
  const workbook = new ExcelJS.Workbook();

  workbook.creator = 'HR Workforce Management System';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(sheetName(report));
  sheet.columns = WIDTHS.map((width) => ({ width }));

  /* ---------- หัวตาราง ---------- */

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

  /* ---------- รายชื่อลูกจ้าง ---------- */

  report.employees.forEach((person, index) => {
    const row = sheet.getRow(index + 2);

    const values: (string | number)[] = [
      person.fullName,
      person.companyName,
      person.branchName,
      person.departmentName,
      person.divisionName,
      person.unitName,
      person.positionName,
      person.employmentType,
      person.reportableWage,
      person.reportableWage,
    ];

    values.forEach((value, column) => {
      const cell = row.getCell(column + 1);
      cell.value = value;
      cell.border = border();

      // สองคอลัมน์ท้ายเป็นเงิน ที่เหลือเป็นข้อความ
      if (column >= 8) {
        cell.numFmt = MONEY;
        cell.alignment = { horizontal: 'right' };
      } else {
        cell.alignment = { vertical: 'middle', wrapText: true };
      }
    });

    row.commit();
  });

  /* ---------- แถวรวม ---------- */

  const totalRowNo = report.employees.length + 2;
  const totalRow = sheet.getRow(totalRowNo);

  sheet.mergeCells(totalRowNo, 1, totalRowNo, 9);
  const label = totalRow.getCell(1);
  label.value = `รวมจำนวนคน ${report.employeeTotals.count} คน`;
  label.font = { bold: true };
  label.alignment = { vertical: 'middle', horizontal: 'left' };

  const total = totalRow.getCell(10);
  total.value = report.employeeTotals.reportableWage;
  total.numFmt = MONEY;
  total.font = { bold: true };
  total.alignment = { horizontal: 'right' };

  for (let column = 1; column <= 10; column += 1) {
    totalRow.getCell(column).border = border();
  }
  totalRow.commit();

  /* หัวตารางค้างไว้ตอนเลื่อน รายชื่อยาวเป็นร้อยบรรทัดจะได้ยังรู้ว่าคอลัมน์ไหน */
  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

  return {
    buffer,
    fileName: `kt-20-k-${report.buddhistYear}.xlsx`,
    mimeType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
}
