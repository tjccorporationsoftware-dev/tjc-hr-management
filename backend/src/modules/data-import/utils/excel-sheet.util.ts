import { BadRequestException } from '@nestjs/common';
import ExcelJS from 'exceljs';

export type SheetGrid = {
  sheetName: string;
  /** ตารางข้อความล้วน แถวแรกของไฟล์อยู่ที่ index 0 */
  rows: string[][];
};

/** จำนวนคอลัมน์สูงสุดที่อ่าน — กันไฟล์ที่มีคอลัมน์ว่างลากยาวเป็นหมื่น */
const MAX_COLUMNS = 120;

function richTextToString(value: unknown) {
  const parts = (value as { richText?: { text?: string }[] }).richText ?? [];

  return parts.map((part) => part.text ?? '').join('');
}

/**
 * แปลงค่าในเซลล์เป็นข้อความ
 *
 * เก็บทุกอย่างเป็นสตริงตั้งแต่ต้นทาง แล้วให้ตัวแปลงของแต่ละชุดข้อมูลตีความเอง
 * เพราะคอลัมน์เดียวกันในไฟล์จริงมาได้หลายแบบ — "01/08/2020" เป็นข้อความบ้าง
 * เป็นเซลล์วันที่จริงบ้าง และรหัสพนักงาน "0670077" ถ้าปล่อยเป็นตัวเลขจะกลายเป็น 670077
 */
export function cellToText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';

  if (value instanceof Date) {
    /*
     * เซลล์วันที่ของ Excel ไม่มีโซนเวลา แต่ exceljs คืน Date เป็น UTC
     * ถ้าอ่านด้วยเวลาท้องถิ่นจะเพี้ยนไปหนึ่งวันในไทย (UTC+7) จึงอ่านส่วน UTC ตรง ๆ
     */
    const year = value.getUTCFullYear();
    const month = String(value.getUTCMonth() + 1).padStart(2, '0');
    const day = String(value.getUTCDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  if (typeof value === 'object') {
    const record = value as unknown as Record<string, unknown>;

    if ('richText' in record) return richTextToString(record).trim();
    if ('text' in record) return String(record.text ?? '').trim();
    if ('result' in record) return cellToText(record.result as ExcelJS.CellValue);
    if ('error' in record) return '';

    return '';
  }

  return String(value).trim();
}

export async function readSheetGrid(
  filePath: string,
  sheetName?: string | null,
): Promise<SheetGrid> {
  const workbook = new ExcelJS.Workbook();

  try {
    await workbook.xlsx.readFile(filePath);
  } catch {
    throw new BadRequestException(
      'เปิดไฟล์ Excel ไม่สำเร็จ ไฟล์อาจเสียหายหรือถูกใส่รหัสผ่านไว้',
    );
  }

  const worksheet = sheetName
    ? workbook.worksheets.find((sheet) => sheet.name === sheetName)
    : /* ไฟล์รายงานมักมีชีตเดียว ถ้ามีหลายชีตให้เลือกชีตที่มีข้อมูลมากที่สุด */
      [...workbook.worksheets].sort(
        (left, right) => right.rowCount - left.rowCount,
      )[0];

  if (!worksheet) {
    throw new BadRequestException('ไม่พบชีตข้อมูลในไฟล์นี้');
  }

  const columnCount = Math.min(worksheet.columnCount || 0, MAX_COLUMNS);
  const rows: string[][] = [];

  for (let rowNo = 1; rowNo <= worksheet.rowCount; rowNo += 1) {
    const row = worksheet.getRow(rowNo);
    const values: string[] = [];

    for (let column = 1; column <= columnCount; column += 1) {
      values.push(cellToText(row.getCell(column).value));
    }

    rows.push(values);
  }

  return { sheetName: worksheet.name, rows };
}
