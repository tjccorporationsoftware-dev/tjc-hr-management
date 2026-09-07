import ExcelJS from 'exceljs';

import type { SsoFormInput, SsoFormRow } from './payroll-sso-form-pdf.util';

/**
 * ไฟล์ Excel รายชื่อผู้ประกันตน สำหรับอัปโหลดเข้าระบบ e-Service
 * -----------------------------------------------------------------------------
 * รูปแบบอ้างอิงจากไฟล์ตัวอย่างที่ลูกค้าใช้อยู่จริง (docs/ข้อมูลรูปแบบไฟล์รายงาน)
 * ซึ่งเป็นไฟล์ "สำหรับป้อนเข้าระบบ" ไม่ใช่รายงานสำหรับอ่าน จึงมีแค่
 *
 *   ชีตเดียว ตั้งชื่อตามลำดับที่สาขา (เช่น 00000)
 *   หัวตารางบรรทัดเดียว แล้วต่อด้วยข้อมูลทันที
 *   6 คอลัมน์ ไม่มีชื่อรายงาน ไม่มียอดรวม ไม่มีคอลัมน์ตรวจสอบ
 *
 * ของเดิมทำเป็นรายงาน 2 ชีตพร้อมยอดรวมและคอลัมน์กระทบยอด ซึ่งอ่านสวยกว่า
 * แต่เอาไปอัปโหลดไม่ได้ เพราะระบบปลายทางอ่านตำแหน่งคอลัมน์ตรงตัว
 * ถ้าต้องการตัวกระทบยอดให้ใช้ CSV ตรวจทานหรือ PDF แทน
 */

/** หัวตารางต้องเรียงตามนี้เป๊ะ ระบบปลายทางอ่านตามตำแหน่งคอลัมน์ */
const COLUMNS: Array<{ header: string; width: number }> = [
  { header: 'เลขบัตรประจำตัวประชาชน / ผู้เสียภาษี', width: 30 },
  { header: 'คำนำหน้าชื่อ', width: 14 },
  { header: 'ชื่อผู้ประกันตน', width: 20 },
  { header: 'นามสกุลผู้ประกันตน', width: 22 },
  { header: 'ค่าจ้าง', width: 14 },
  { header: 'จำนวนเงินสมทบ', width: 16 },
];

/**
 * ชื่อชีตคือลำดับที่สาขา
 *
 * ไฟล์ตัวอย่างใช้ "00000" ซึ่งคือรหัสสาขาของสถานประกอบการนั้น ระบบปลายทางใช้
 * ชื่อชีตระบุว่าข้อมูลชุดนี้เป็นของสาขาไหน จึงไม่ใช่แค่ป้ายกำกับให้คนอ่าน
 */
function sheetName(input: SsoFormInput) {
  const digits = (input.company.socialSecurityBranchNo ?? '').replace(
    /\D/g,
    '',
  );

  return digits || '00000';
}

/**
 * แยกคำนำหน้า ชื่อ และสกุล
 *
 * ทะเบียนพนักงานเก็บแยกช่องอยู่แล้ว ถ้าไม่มีค่อยถอยไปตัดจากชื่อเต็ม เพราะไฟล์นี้
 * ต้องลงคนละคอลัมน์ จะยัดชื่อเต็มลงช่องเดียวไม่ได้
 */
function splitName(row: SsoFormRow) {
  const title = (row.title ?? '').trim();
  const firstName = (row.firstName ?? '').trim();
  const lastName = (row.lastName ?? '').trim();

  if (firstName || lastName) return { title, firstName, lastName };

  const parts = (row.employeeName ?? '').trim().split(/\s+/).filter(Boolean);

  return {
    title,
    firstName: parts[0] ?? '',
    lastName: parts.slice(1).join(' '),
  };
}

/**
 * เลขที่ใช้ระบุตัวผู้ประกันตน
 *
 * แบบ สปส. ให้ใช้เลขประจำตัวประชาชนเป็นหลัก ส่วนคนต่างด้าวให้ใช้เลขที่บัตร
 * ประกันสังคมในช่องเดียวกัน จึงเลือกเลขบัตรก่อนแล้วค่อยตกมาที่เลขผู้ประกันตน
 */
function identityNo(row: SsoFormRow) {
  return (row.nationalId || row.socialSecurityNo || '').replace(/\D/g, '');
}

export async function generateSsoFormXlsx(input: SsoFormInput) {
  const workbook = new ExcelJS.Workbook();

  workbook.creator = 'HR-TJC GROUP';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(sheetName(input), {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  sheet.columns = COLUMNS.map((column) => ({ width: column.width }));

  const headerRow = sheet.getRow(1);
  COLUMNS.forEach((column, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = column.header;
    cell.font = { bold: true };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });
  headerRow.commit();

  input.rows.forEach((row, index) => {
    const name = splitName(row);
    const excelRow = sheet.getRow(index + 2);

    /*
     * เลขบัตรลงเป็นข้อความ ไม่ใช่ตัวเลข
     * เลข 13 หลักที่ลงเป็นตัวเลขจะถูก Excel แปลงเป็น 1.3499E+12 และศูนย์นำหน้า
     * จะหายไป ทำให้ไฟล์ใช้อัปโหลดไม่ได้
     */
    excelRow.getCell(1).value = identityNo(row);
    excelRow.getCell(1).alignment = { horizontal: 'left' };

    excelRow.getCell(2).value = name.title;
    excelRow.getCell(3).value = name.firstName;
    excelRow.getCell(4).value = name.lastName;

    // ค่าจ้างที่จ่ายจริง ไม่ใช่ฐานหลังชนเพดาน (คำชี้แจงข้อ 1 ท้ายแบบ)
    excelRow.getCell(5).value = row.actualWage;
    excelRow.getCell(5).numFmt = '#,##0.00';

    // เงินสมทบที่นำส่งจริง ปัดเป็นบาทเต็มแล้วตามคำชี้แจงข้อ 4
    excelRow.getCell(6).value = row.employeeContributionFiled;
    excelRow.getCell(6).numFmt = '#,##0.00';

    excelRow.commit();
  });

  const buffer = await workbook.xlsx.writeBuffer();

  return {
    buffer: Buffer.from(buffer),
    fileName: `sso-1-10-${input.run.runNo}.xlsx`,
    mimeType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
}
