import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { extname, resolve, sep } from 'path';

export const DOCUMENT_FILE_STORAGE_PROVIDER = 'LOCAL';
export const DOCUMENT_FILE_BUCKET = 'document-files';

export const DOCUMENT_FILE_MAX_FILE_SIZE = 10 * 1024 * 1024;

export const DOCUMENT_FILE_ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
];

function sanitizePathSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, '');
}

export function getDocumentFileStorageRootDir() {
  return resolve(process.cwd(), 'storage', 'document-files');
}

export function ensureDocumentFileStorageDir(documentRequestId?: string) {
  const rootDir = getDocumentFileStorageRootDir();

  if (!existsSync(rootDir)) {
    mkdirSync(rootDir, { recursive: true });
  }

  if (!documentRequestId) {
    return rootDir;
  }

  const safeDocumentRequestId = sanitizePathSegment(documentRequestId);
  const requestDir = resolve(rootDir, safeDocumentRequestId);

  if (!requestDir.startsWith(rootDir + sep)) {
    throw new BadRequestException('Storage path ไม่ถูกต้อง');
  }

  if (!existsSync(requestDir)) {
    mkdirSync(requestDir, { recursive: true });
  }

  return requestDir;
}

export function createDocumentFileName(originalName: string) {
  const extension = extname(originalName || '').toLowerCase() || '.bin';

  return `${randomUUID()}${extension}`;
}

export function createDocumentFileStorageKey(params: {
  documentRequestId: string;
  filename: string;
}) {
  const safeDocumentRequestId = sanitizePathSegment(params.documentRequestId);
  const safeFilename = params.filename.replace(/[/\\]/g, '');

  return `${safeDocumentRequestId}/${safeFilename}`;
}

export function getDocumentFileAbsolutePath(storageKey: string) {
  const rootDir = getDocumentFileStorageRootDir();
  const filePath = resolve(rootDir, storageKey);

  if (!filePath.startsWith(rootDir + sep)) {
    throw new BadRequestException('Storage key ไม่ถูกต้อง');
  }

  return filePath;
}

export function validateDocumentFile(file?: Express.Multer.File) {
  if (!file) {
    throw new BadRequestException('กรุณาอัปโหลดไฟล์เอกสาร');
  }

  if (!DOCUMENT_FILE_ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    throw new BadRequestException(
      'รองรับเฉพาะไฟล์ PDF, JPG, PNG หรือ WEBP เท่านั้น',
    );
  }

  if (file.size > DOCUMENT_FILE_MAX_FILE_SIZE) {
    throw new BadRequestException('ขนาดไฟล์ต้องไม่เกิน 10MB');
  }
}

export function documentFileFilter(
  _req: unknown,
  file: Express.Multer.File,
  callback: (error: Error | null, acceptFile: boolean) => void,
) {
  if (!DOCUMENT_FILE_ALLOWED_MIME_TYPES.includes(file.mimetype)) {
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