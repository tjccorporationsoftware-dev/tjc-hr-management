import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { extname, join, normalize } from 'path';

import { assertSafePathId } from '../../../common/utils/safe-path-id.util';

export const DATA_IMPORT_BUCKET = 'data-imports';
export const DATA_IMPORT_STORAGE_PROVIDER = 'LOCAL';
export const DATA_IMPORT_MAX_FILE_SIZE = 15 * 1024 * 1024;

/*
 * ไฟล์นำเข้าไม่ได้อยู่ใต้ public/uploads เหมือนไฟล์แนบของใบคำขอ
 *
 * ไฟล์พวกนี้เป็นทะเบียนพนักงานทั้งบริษัทหรือฐานเงินเดือนทั้งงวด ถ้าวางไว้ใต้
 * โฟลเดอร์ที่เสิร์ฟเป็นไฟล์สาธารณะ ใครเดา storage key ถูกก็โหลดไปได้ทั้งก้อน
 */
const IMPORT_ROOT = join(process.cwd(), 'storage', 'imports');

/*
 * .xlsx คือไฟล์ zip ที่ข้างในเป็น XML เบราว์เซอร์บนเครื่องที่ไม่ได้ลง Office
 * จึงส่ง mimetype มาเป็น zip หรือ octet-stream แทนชนิดของ Excel จริง
 * ตัวตัดสินหลักคือนามสกุลไฟล์ ส่วนรายการนี้กันแค่ไฟล์ที่ผิดชนิดอย่างชัดเจน
 */
const allowedMimeTypes = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/vnd.ms-excel.sheet.macroEnabled.12',
  'application/octet-stream',
  'application/zip',
  'application/x-zip-compressed',
  'multipart/x-zip',
]);

const allowedExtensions = new Set(['.xlsx', '.xls']);

function sanitizeFileName(fileName: string) {
  return fileName
    .replace(/[^\w.\-฀-๿]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 160);
}

export function ensureDataImportStorageDir(importKey: string) {
  const dir = join(
    IMPORT_ROOT,
    assertSafePathId(importKey, 'รหัสงานนำเข้า'),
  );

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  return dir;
}

export function createDataImportFileName(originalName: string) {
  const ext = extname(originalName).toLowerCase();
  const safeName = sanitizeFileName(originalName.replace(ext, ''));

  return `${Date.now()}-${randomUUID()}-${safeName}${ext}`;
}

export function createDataImportStorageKey(params: {
  importKey: string;
  filename: string;
}) {
  return `${params.importKey}/${params.filename}`;
}

export function getDataImportAbsolutePath(storageKey: string) {
  const absolutePath = normalize(join(IMPORT_ROOT, storageKey));
  const normalizedRoot = normalize(IMPORT_ROOT);

  if (!absolutePath.startsWith(normalizedRoot)) {
    throw new BadRequestException('Storage key ไม่ถูกต้อง');
  }

  return absolutePath;
}

export function dataImportFileFilter(
  _req: unknown,
  file: Express.Multer.File,
  callback: (error: Error | null, acceptFile: boolean) => void,
) {
  const ext = extname(file.originalname).toLowerCase();

  if (!allowedExtensions.has(ext)) {
    callback(
      new BadRequestException('รองรับเฉพาะไฟล์ Excel (.xlsx, .xls) เท่านั้น'),
      false,
    );
    return;
  }

  callback(null, true);
}

export function validateDataImportFile(file?: Express.Multer.File) {
  if (!file) {
    throw new BadRequestException('กรุณาเลือกไฟล์ Excel ที่ต้องการนำเข้า');
  }

  const ext = extname(file.originalname).toLowerCase();

  /*
   * เช็คนามสกุลเป็นหลัก ไม่ใช่ mimetype
   *
   * เบราว์เซอร์บนเครื่องที่ไม่ได้ลง Office ส่ง .xlsx มาเป็น
   * application/octet-stream ประจำ ถ้าเชื่อ mimetype อย่างเดียวจะเด้งไฟล์ที่ถูกต้อง
   */
  if (!allowedExtensions.has(ext)) {
    throw new BadRequestException(
      'รองรับเฉพาะไฟล์ Excel (.xlsx, .xls) เท่านั้น',
    );
  }

  if (file.mimetype && !allowedMimeTypes.has(file.mimetype)) {
    throw new BadRequestException(
      'ชนิดไฟล์ไม่ถูกต้อง กรุณาอัปโหลดไฟล์ Excel ที่บันทึกจากโปรแกรมตารางคำนวณ',
    );
  }

  if (file.size > DATA_IMPORT_MAX_FILE_SIZE) {
    throw new BadRequestException('ไฟล์ต้องมีขนาดไม่เกิน 15 MB');
  }
}
