import type { Pnd3Form } from './pnd3-form.util';

/**
 * ตาราง CSV ของแบบ ภ.ง.ด.3
 * -----------------------------------------------------------------------------
 * เรียงคอลัมน์ตามช่องบนใบแนบ แนวเดียวกับ CSV ของ ภ.ง.ด.1 ที่ทำไว้แล้ว
 * ต่างกันตรงมี "ประเภทเงินได้" กับ "อัตราภาษี" เพิ่มมา เพราะ ภ.ง.ด.3 หักคนละ
 * อัตราตามว่าจ่ายเป็นค่าอะไร ส่วน ภ.ง.ด.1 เป็นเงินเดือนอย่างเดียว
 *
 * สร้างจากข้อมูลชุดเดียวกับแบบพิมพ์ ตัวเลขจึงตรงกันเสมอ
 */

/** ใส่ BOM ให้ Excel อ่านภาษาไทยออก */
const BOM = '﻿';

function csvEscape(value: string | number | null | undefined) {
  if (value === null || value === undefined) return '';

  const text = typeof value === 'string' ? value : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(headers: string[], rows: (string | number)[][]) {
  const lines = [headers.map(csvEscape).join(',')];
  for (const row of rows) lines.push(row.map(csvEscape).join(','));

  return `${BOM}${lines.join('\r\n')}\r\n`;
}

function amount(value: number) {
  return value.toFixed(2);
}

export function buildPnd3TableCsv(form: Pnd3Form) {
  const headers = [
    'ลำดับ',
    'เลขประจำตัวผู้เสียภาษี',
    'สาขาที่',
    'คำนำหน้า',
    'ชื่อ',
    'สกุล',
    'ที่อยู่',
    'วันเดือนปีที่จ่าย',
    'ประเภทเงินได้',
    'อัตราภาษีร้อยละ',
    'จำนวนเงินที่จ่าย',
    'ภาษีที่หัก',
    'เงื่อนไข',
  ];

  const rows = form.rows.map((row) => [
    row.sequence,
    row.identityNo,
    row.branchNo,
    row.title,
    row.firstName,
    row.lastName,
    row.address,
    row.paidOnText,
    row.incomeTypeLabel,
    row.taxRateText,
    amount(row.amount),
    amount(row.taxAmount),
    row.condition,
  ]);

  const monthPart = String(form.month).padStart(2, '0');

  return {
    csv: toCsv(headers, rows),
    fileName: `pnd3-${form.gregorianYear}-${monthPart}.csv`,
  };
}
