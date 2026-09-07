import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { extname, resolve, sep } from 'path';

export const EMPLOYEE_DOCUMENT_STORAGE_PROVIDER = 'LOCAL';
export const EMPLOYEE_DOCUMENT_BUCKET = 'employee-documents';

export const EMPLOYEE_DOCUMENT_MAX_FILE_SIZE = 10 * 1024 * 1024;

export const EMPLOYEE_DOCUMENT_ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
];

function sanitizePathSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, '');
}

export function getEmployeeDocumentStorageRootDir() {
  return resolve(process.cwd(), 'storage', 'employee-documents');
}

export function ensureEmployeeDocumentStorageDir(employeeId?: string) {
  const rootDir = getEmployeeDocumentStorageRootDir();

  if (!existsSync(rootDir)) {
    mkdirSync(rootDir, { recursive: true });
  }

  if (!employeeId) {
    return rootDir;
  }

  const safeEmployeeId = sanitizePathSegment(employeeId);
  const employeeDir = resolve(rootDir, safeEmployeeId);

  if (!employeeDir.startsWith(rootDir + sep)) {
    throw new BadRequestException('Storage path ไม่ถูกต้อง');
  }

  if (!existsSync(employeeDir)) {
    mkdirSync(employeeDir, { recursive: true });
  }

  return employeeDir;
}

export function createEmployeeDocumentFileName(originalName: string) {
  const extension = extname(originalName || '').toLowerCase() || '.bin';

  return `${randomUUID()}${extension}`;
}

export function createEmployeeDocumentStorageKey(params: {
  employeeId: string;
  filename: string;
}) {
  const safeEmployeeId = sanitizePathSegment(params.employeeId);
  const safeFilename = params.filename.replace(/[/\\]/g, '');

  return `${safeEmployeeId}/${safeFilename}`;
}

export function getEmployeeDocumentAbsolutePath(storageKey: string) {
  const rootDir = getEmployeeDocumentStorageRootDir();
  const filePath = resolve(rootDir, storageKey);

  if (!filePath.startsWith(rootDir + sep)) {
    throw new BadRequestException('Storage key ไม่ถูกต้อง');
  }

  return filePath;
}

export function validateEmployeeDocumentFile(file?: Express.Multer.File) {
  if (!file) {
    throw new BadRequestException('กรุณาอัปโหลดไฟล์เอกสาร');
  }

  if (!EMPLOYEE_DOCUMENT_ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    throw new BadRequestException(
      'รองรับเฉพาะไฟล์ PDF, JPG, PNG หรือ WEBP เท่านั้น',
    );
  }

  if (file.size > EMPLOYEE_DOCUMENT_MAX_FILE_SIZE) {
    throw new BadRequestException('ขนาดไฟล์ต้องไม่เกิน 10MB');
  }
}

export function employeeDocumentFileFilter(
  _req: unknown,
  file: Express.Multer.File,
  callback: (error: Error | null, acceptFile: boolean) => void,
) {
  if (!EMPLOYEE_DOCUMENT_ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    callback(
      new BadRequestException(
        'รองรับเฉพาะไฟล์ PDF, JPG, PNG หรือ WEBP เท่านั้น',
      ),
      false,
    );
    return;
  }

  callback(null, true);
}