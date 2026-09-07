import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { extname, join, normalize } from 'path';
import { assertSafePathId } from '../../common/utils/safe-path-id.util';

export const OVERTIME_ATTACHMENT_BUCKET = 'overtime-attachments';
export const OVERTIME_ATTACHMENT_STORAGE_PROVIDER = 'LOCAL';
export const OVERTIME_ATTACHMENT_MAX_FILE_SIZE = 10 * 1024 * 1024;

const UPLOAD_ROOT = join(process.cwd(), 'public', 'uploads');

const allowedMimeTypes = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
]);

const allowedExtensions = new Set(['.pdf', '.jpg', '.jpeg', '.png']);

function sanitizeFileName(fileName: string) {
  return fileName
    .replace(/[^\w.\-\u0E00-\u0E7F]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 160);
}

export function ensureOvertimeAttachmentStorageDir(overtimeRequestId?: string) {
  if (!overtimeRequestId) {
    throw new BadRequestException('ไม่พบรหัสคำขอ OT');
  }

  const dir = join(
    UPLOAD_ROOT,
    OVERTIME_ATTACHMENT_BUCKET,
    assertSafePathId(overtimeRequestId, 'รหัสคำขอ OT'),
  );

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  return dir;
}

export function createOvertimeAttachmentFileName(originalName: string) {
  const ext = extname(originalName).toLowerCase();
  const safeName = sanitizeFileName(originalName.replace(ext, ''));

  return `${Date.now()}-${randomUUID()}-${safeName}${ext}`;
}

export function createOvertimeAttachmentStorageKey(params: {
  overtimeRequestId: string;
  filename: string;
}) {
  return `${OVERTIME_ATTACHMENT_BUCKET}/${params.overtimeRequestId}/${params.filename}`;
}

export function getOvertimeAttachmentAbsolutePath(storageKey: string) {
  const absolutePath = normalize(join(UPLOAD_ROOT, storageKey));
  const normalizedRoot = normalize(UPLOAD_ROOT);

  if (!absolutePath.startsWith(normalizedRoot)) {
    throw new BadRequestException('Storage key ไม่ถูกต้อง');
  }

  return absolutePath;
}

export function overtimeAttachmentFileFilter(
  _req: unknown,
  file: Express.Multer.File,
  callback: (error: Error | null, acceptFile: boolean) => void,
) {
  const ext = extname(file.originalname).toLowerCase();

  if (!allowedMimeTypes.has(file.mimetype) || !allowedExtensions.has(ext)) {
    callback(
      new BadRequestException(
        'รองรับเฉพาะไฟล์ PDF, JPG, JPEG และ PNG เท่านั้น',
      ),
      false,
    );
    return;
  }

  callback(null, true);
}

export function validateOvertimeAttachmentFile(file?: Express.Multer.File) {
  if (!file) {
    throw new BadRequestException('กรุณาเลือกไฟล์หลักฐาน');
  }

  const ext = extname(file.originalname).toLowerCase();

  if (!allowedMimeTypes.has(file.mimetype) || !allowedExtensions.has(ext)) {
    throw new BadRequestException(
      'รองรับเฉพาะไฟล์ PDF, JPG, JPEG และ PNG เท่านั้น',
    );
  }

  if (file.size > OVERTIME_ATTACHMENT_MAX_FILE_SIZE) {
    throw new BadRequestException('ไฟล์ต้องมีขนาดไม่เกิน 10 MB');
  }
}