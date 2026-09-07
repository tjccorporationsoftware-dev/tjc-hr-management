import type { DataImportDuplicateMode, DataImportType } from '../../../generated/prisma/client';

export type DataImportFieldType = 'TEXT' | 'DATE' | 'NUMBER';

export type DataImportFieldDef = {
  key: string;
  label: string;
  /** ไม่มีค่านี้ = นำเข้าแถวนั้นไม่ได้ */
  required?: boolean;
  /** หัวคอลัมน์ที่เคยเจอในไฟล์จริง ใช้เดาการจับคู่อัตโนมัติ */
  aliases: string[];
  type: DataImportFieldType;
  hint?: string;
};

/** { fieldKey: หมายเลขคอลัมน์เริ่มที่ 1 } — null = ไม่ได้จับคู่ */
export type DataImportMapping = Record<string, number | null>;

export type DataImportRowAction = 'CREATE' | 'UPDATE' | 'SKIP' | 'ERROR';

export type DataImportPreparedRow = {
  /** เลขแถวจริงในไฟล์ เพื่อให้ผู้ใช้เปิดไฟล์ไปแก้ได้ถูกแถว */
  rowNo: number;
  key: string;
  title: string;
  action: DataImportRowAction;
  values: Record<string, string>;
  errors: string[];
  warnings: string[];
  /** ผลการแปลงที่ commit เอาไปใช้ต่อ ไม่ต้องแปลงซ้ำ */
  payload: unknown;
};

export type DataImportPrepareParams = {
  rows: string[][];
  headerRowIndex: number;
  mapping: DataImportMapping;
  duplicateMode: DataImportDuplicateMode;
  companyId: string;
};

export type DataImportCommitParams = {
  row: DataImportPreparedRow;
  companyId: string;
  actorId: string | null;
};

/**
 * ชุดข้อมูลหนึ่งชนิดที่หน้า "นำเข้าข้อมูล" รองรับ
 *
 * โครงกลาง (อ่านไฟล์ เดาหัวตาราง จับคู่คอลัมน์ พรีวิว ยืนยัน เก็บประวัติ) ใช้ร่วมกัน
 * ชุดข้อมูลใหม่จึงเพิ่มแค่ไฟล์เดียวที่ประกาศ fields กับวิธีเขียนข้อมูลของตัวเอง
 */
export interface DataImportDataset {
  readonly type: DataImportType;
  readonly label: string;
  readonly description: string;
  readonly fields: DataImportFieldDef[];

  prepare(params: DataImportPrepareParams): Promise<DataImportPreparedRow[]>;

  commitRow(params: DataImportCommitParams): Promise<void>;
}
