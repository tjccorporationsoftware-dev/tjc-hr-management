/**
 * ตัวช่วยสร้างไฟล์ CSV สำหรับรายงานนำส่งหน่วยงาน
 * -----------------------------------------------------------------------------
 * ไฟล์พวกนี้ถูกเปิดด้วย Excel ภาษาไทยเป็นหลัก จึงต้องมี BOM
 * ไม่งั้นตัวอักษรไทยจะกลายเป็นขยะทันทีที่เปิด
 */

/** ค่าที่ใส่ลงช่อง CSV ได้ — object ไม่รับ เพราะจะกลายเป็น [object Object] */
export type CsvValue = string | number | boolean | null | undefined;

function toText(value: CsvValue) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  return String(value);
}

export function csvEscape(value: CsvValue) {
  const text = toText(value);
  if (!text) return '';

  // มีตัวคั่น เครื่องหมายคำพูด หรือขึ้นบรรทัดใหม่ ต้องครอบด้วย " และ escape "
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

/** BOM บอก Excel ว่าไฟล์เป็น UTF-8 ไม่งั้นภาษาไทยจะเป็นขยะ */
const UTF8_BOM = '﻿';

export function buildCsv(
  headers: string[],
  rows: Array<Record<string, CsvValue>>,
) {
  const lines = [headers.map(csvEscape).join(',')];

  for (const row of rows) {
    lines.push(headers.map((header) => csvEscape(row[header])).join(','));
  }

  return `${UTF8_BOM}${lines.join('\r\n')}`;
}

/** ทำชื่อไฟล์ให้ปลอดภัยกับทุกระบบปฏิบัติการ */
export function safeFileName(value: CsvValue, fallback: string) {
  const text = toText(value).trim();
  return (text || fallback).replace(/[^0-9A-Za-z._-]+/g, '-');
}

/** ตัวเลขเงินในไฟล์นำส่ง ต้องเป็นทศนิยม 2 ตำแหน่งเสมอ ไม่มีคอมมา */
export function csvMoney(value: CsvValue) {
  const parsed = Number(value ?? 0);
  return (Number.isFinite(parsed) ? parsed : 0).toFixed(2);
}

/** เลขบัตร/เลขบัญชี ต้องเก็บเป็นข้อความ ไม่ให้ Excel ตัดเลข 0 นำหน้าทิ้ง */
export function csvDigits(value: CsvValue) {
  return toText(value).replace(/\D/g, '');
}

export function toDateOnlyText(value?: Date | string | null) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}
