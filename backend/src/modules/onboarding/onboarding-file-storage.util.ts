import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { extname, resolve, sep } from 'path';

/**
 * ที่เก็บไฟล์แนบของเอกสารพนักงานใหม่
 * ----------------------------------
 * แยกโฟลเดอร์จากเอกสารของ document-workflow เพราะคนละเรื่องกันและอายุการเก็บ
 * ต่างกัน — สำเนาบัตรประชาชนของพนักงานเก็บยาว ส่วนหนังสือรับรองออกแล้วจบ
 *
 * เก็บลงดิสก์เครื่องเดียวกับ backend เหมือนโมดูลอื่นในระบบนี้
 * ถ้าวันหนึ่งขึ้นหลายเครื่องต้องเปลี่ยนไปใช้ object storage ทั้งระบบพร้อมกัน
 */

export const ONBOARDING_FILE_STORAGE_PROVIDER = 'LOCAL';
export const ONBOARDING_FILE_BUCKET = 'onboarding-documents';

export const ONBOARDING_FILE_MAX_FILE_SIZE = 10 * 1024 * 1024;

/** รับเฉพาะ PDF กับรูป — เอกสารพนักงานใหม่คือสำเนาบัตร/วุฒิ/สมุดบัญชี */
export const ONBOARDING_FILE_ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
];

function sanitizePathSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, '');
}

export function getOnboardingFileStorageRootDir() {
  return resolve(process.cwd(), 'storage', 'onboarding-documents');
}

export function ensureOnboardingFileStorageDir(documentId?: string) {
  const rootDir = getOnboardingFileStorageRootDir();

  if (!existsSync(rootDir)) {
    mkdirSync(rootDir, { recursive: true });
  }

  if (!documentId) {
    return rootDir;
  }

  const safeId = sanitizePathSegment(documentId);
  const dir = resolve(rootDir, safeId);

  // กัน path traversal จาก id ที่ถูกดัดแปลง
  if (!dir.startsWith(rootDir + sep)) {
    throw new BadRequestException('Storage path ไม่ถูกต้อง');
  }

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  return dir;
}

export function createOnboardingFileName(originalName: string) {
  const extension = extname(originalName || '').toLowerCase() || '.bin';

  return `${randomUUID()}${extension}`;
}

export function createOnboardingFileStorageKey(params: {
  documentId: string;
  filename: string;
}) {
  return `${sanitizePathSegment(params.documentId)}/${params.filename}`;
}

export function resolveOnboardingFilePath(storageKey: string) {
  const rootDir = getOnboardingFileStorageRootDir();
  const fullPath = resolve(rootDir, storageKey);

  if (!fullPath.startsWith(rootDir + sep)) {
    throw new BadRequestException('Storage path ไม่ถูกต้อง');
  }

  return fullPath;
}

export function validateOnboardingFile(file?: Express.Multer.File) {
  if (!file) {
    throw new BadRequestException('กรุณาแนบไฟล์');
  }

  if (!ONBOARDING_FILE_ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    throw new BadRequestException(
      'รองรับเฉพาะไฟล์ PDF และรูปภาพ (JPG, PNG, WebP, HEIC)',
    );
  }

  if (file.size > ONBOARDING_FILE_MAX_FILE_SIZE) {
    throw new BadRequestException('ไฟล์ใหญ่เกิน 10 MB');
  }
}

export function onboardingFileFilter(
  _req: unknown,
  file: Express.Multer.File,
  callback: (error: Error | null, acceptFile: boolean) => void,
) {
  if (!ONBOARDING_FILE_ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    callback(
      new BadRequestException(
        'รองรับเฉพาะไฟล์ PDF และรูปภาพ (JPG, PNG, WebP, HEIC)',
      ),
      false,
    );
    return;
  }

  callback(null, true);
}
