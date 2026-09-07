import { BadRequestException } from '@nestjs/common';

import type {
  DataImportFieldDef,
  DataImportMapping,
} from '../datasets/data-import-dataset.types';
import { normalizeHeaderText } from './data-import-value.util';

/** ไฟล์รายงานมักมีหัวเรื่อง/ชื่อบริษัทคร่อมอยู่ไม่กี่แถวก่อนถึงหัวตารางจริง */
const HEADER_SEARCH_DEPTH = 15;

/** ต้องเจอหัวคอลัมน์ที่รู้จักอย่างน้อยเท่านี้ ถึงจะเชื่อว่าแถวนั้นคือหัวตาราง */
const MIN_HEADER_MATCH = 2;

function matchesAlias(headerText: string, alias: string) {
  const header = normalizeHeaderText(headerText);
  const target = normalizeHeaderText(alias);

  if (!header || !target) return false;
  if (header === target) return true;

  /*
   * ยอมให้ตรงแบบ "มีคำนี้อยู่ข้างใน" เฉพาะคำที่ยาวพอ
   * คำสั้นอย่าง "id" หรือ "ชื่อ" ไปโผล่ในหัวคอลัมน์อื่นได้ง่ายเกินไป
   */
  return target.length >= 5 && header.includes(target);
}

function scoreHeaderRow(row: string[], fields: DataImportFieldDef[]) {
  return fields.reduce((score, field) => {
    const hit = row.some((cell) =>
      field.aliases.some((alias) => matchesAlias(cell, alias)),
    );

    return hit ? score + 1 : score;
  }, 0);
}

export function detectHeaderRowIndex(
  rows: string[][],
  fields: DataImportFieldDef[],
): number {
  const depth = Math.min(rows.length, HEADER_SEARCH_DEPTH);

  let bestIndex = -1;
  let bestScore = 0;

  for (let index = 0; index < depth; index += 1) {
    const score = scoreHeaderRow(rows[index] ?? [], fields);

    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }

  if (bestIndex < 0 || bestScore < MIN_HEADER_MATCH) {
    throw new BadRequestException(
      'หาแถวหัวตารางในไฟล์นี้ไม่เจอ กรุณาตรวจว่าเลือกชนิดข้อมูลถูกต้อง และไฟล์มีแถวหัวคอลัมน์',
    );
  }

  return bestIndex;
}

export function buildAutoMapping(
  headerRow: string[],
  fields: DataImportFieldDef[],
): DataImportMapping {
  const mapping: DataImportMapping = {};
  const usedColumns = new Set<number>();

  /*
   * เดินสองรอบ: รอบแรกเอาเฉพาะที่ชื่อตรงเป๊ะ รอบสองค่อยยอมให้ตรงแบบมีคำอยู่ข้างใน
   *
   * ไฟล์ทะเบียนพนักงานมีทั้ง "ชื่อเล่น" และ "ชื่อเล่น(EN)" ถ้าเดินรอบเดียว
   * ช่องชื่อเล่นภาษาไทยจะไปคว้าคอลัมน์ EN ที่อยู่ก่อนหน้าได้
   */
  for (const exactOnly of [true, false]) {
    for (const field of fields) {
      if (mapping[field.key]) continue;

      const columnIndex = headerRow.findIndex((cell, index) => {
        if (usedColumns.has(index + 1)) return false;

        return field.aliases.some((alias) =>
          exactOnly
            ? normalizeHeaderText(cell) === normalizeHeaderText(alias)
            : matchesAlias(cell, alias),
        );
      });

      if (columnIndex >= 0) {
        mapping[field.key] = columnIndex + 1;
        usedColumns.add(columnIndex + 1);
      }
    }
  }

  for (const field of fields) {
    if (!mapping[field.key]) mapping[field.key] = null;
  }

  return mapping;
}

/** กรองการจับคู่ที่ผู้ใช้ส่งมาให้เหลือเฉพาะฟิลด์และคอลัมน์ที่มีจริง */
export function normalizeMapping(
  input: DataImportMapping | null | undefined,
  fields: DataImportFieldDef[],
  columnCount: number,
): DataImportMapping {
  const mapping: DataImportMapping = {};

  for (const field of fields) {
    const raw = input?.[field.key];
    const column = typeof raw === 'number' && Number.isInteger(raw) ? raw : null;

    mapping[field.key] =
      column && column >= 1 && column <= columnCount ? column : null;
  }

  return mapping;
}

export function assertRequiredFieldsMapped(
  mapping: DataImportMapping,
  fields: DataImportFieldDef[],
) {
  const missing = fields
    .filter((field) => field.required && !mapping[field.key])
    .map((field) => field.label);

  if (missing.length > 0) {
    throw new BadRequestException(
      `ยังจับคู่คอลัมน์ที่จำเป็นไม่ครบ: ${missing.join(', ')}`,
    );
  }
}

export function readCell(
  row: string[],
  mapping: DataImportMapping,
  key: string,
): string {
  const column = mapping[key];

  if (!column) return '';

  return (row[column - 1] ?? '').trim();
}
