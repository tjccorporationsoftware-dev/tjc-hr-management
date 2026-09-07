import {
  PND1_DEFAULT_CONDITION,
  PND1_FILING_FORM_CODE,
  type Pnd1Form,
} from './payroll-pnd1-form.util';
import type { Pnd1aForm } from './payroll-pnd1a-form.util';

/**
 * ตาราง CSV ของแบบ ภ.ง.ด.1 และ ภ.ง.ด.1ก
 * -----------------------------------------------------------------------------
 * เรียงคอลัมน์ตามไฟล์ที่ระบบเดิมของลูกค้าออก เพื่อให้เอาไปใช้แทนกันได้ทันที
 *
 *   ลำดับ · เลขประจำตัวผู้เสียภาษี · คำนำหน้า · ชื่อ · สกุล ·
 *   เงินได้ตามมาตรา · วันเดือนปีที่จ่าย · จำนวนเงินได้ · ภาษีที่ต้องหัก · เงื่อนไข
 *
 * เป็นไฟล์ข้อมูลล้วน ไม่มีแถวรวมและไม่มีคอลัมน์ช่วยตรวจ เพราะแถวสรุปจะทำให้
 * โปรแกรมที่อ่านไฟล์ต่อสะดุด — ยอดรวมดูได้จากหน้าปกของแบบพิมพ์อยู่แล้ว
 *
 * สร้างจากข้อมูลชุดเดียวกับที่พิมพ์ลงแบบฟอร์มและไฟล์ TXT ตัวเลขจึงตรงกันทุกไฟล์
 * ถ้าดึงคนละทางแล้ววันหนึ่งตัวคำนวณเปลี่ยน ไฟล์จะเพี้ยนออกจากกันโดยไม่มีใครรู้
 */

/** ใส่ BOM ให้ Excel อ่านภาษาไทยออก ไม่งั้นเปิดมาเป็นตัวยึกยือ */
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

/** ยอดเงินไม่ใส่ตัวคั่นหลักพัน จะได้เอาไปคำนวณต่อได้ทันที */
function amount(value: number) {
  return value.toFixed(2);
}

/** ตาราง ภ.ง.ด.1 (รายเดือน) */
export function buildPnd1TableCsv(form: Pnd1Form) {
  const headers = [
    'ลำดับ',
    'เลขประจำตัวผู้เสียภาษี',
    'คำนำหน้า',
    'ชื่อ',
    'สกุล',
    'เงินได้ตามมาตรา',
    'วันเดือนปีที่จ่าย',
    'จำนวนเงินได้',
    'ภาษีที่ต้องหัก',
    'เงื่อนไข',
  ];

  const rows = form.rows.map((row) => [
    row.sequence,
    row.identityNo,
    row.title,
    row.firstName,
    row.lastName,
    PND1_FILING_FORM_CODE,
    row.paidOnText,
    amount(row.paidAmount),
    amount(row.taxWithheld),
    row.condition,
  ]);

  const monthPart = String(form.month).padStart(2, '0');

  return {
    csv: toCsv(headers, rows),
    fileName: `pnd1-${form.gregorianYear}-${monthPart}.csv`,
  };
}

/**
 * ตาราง ภ.ง.ด.1ก (รายปี)
 *
 * ต่างจากรายเดือนสองช่อง — ไม่มีวันที่จ่าย เพราะเป็นยอดรวมทั้งปีไม่ใช่ครั้งเดียว
 * และเพิ่มที่อยู่ เพราะใบแนบ ภ.ง.ด.1ก กับ 50 ทวิ ต้องใช้
 */
export function buildPnd1aTableCsv(form: Pnd1aForm) {
  const headers = [
    'ลำดับ',
    'เลขประจำตัวผู้เสียภาษี',
    'คำนำหน้า',
    'ชื่อ',
    'สกุล',
    'เงินได้ตามมาตรา',
    'ที่อยู่',
    'จำนวนเงินได้',
    'ภาษีที่ต้องหัก',
    'เงื่อนไข',
  ];

  const rows = form.rows.map((row) => [
    row.sequence,
    row.identityNo,
    row.title,
    row.firstName,
    row.lastName,
    PND1_FILING_FORM_CODE,
    row.address,
    amount(row.paidAmount),
    amount(row.taxWithheld),
    /* ในแบบพิมพ์ช่องนี้เขียนเป็น "(1)" แต่ในไฟล์ข้อมูลใช้เลขล้วน */
    PND1_DEFAULT_CONDITION,
  ]);

  return {
    csv: toCsv(headers, rows),
    fileName: `pnd1a-${form.buddhistYear}.csv`,
  };
}
