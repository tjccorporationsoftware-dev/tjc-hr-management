import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { extname, join, normalize } from 'path';
import { assertSafePathId } from '../../common/utils/safe-path-id.util';

export const TIME_ADJUST_ATTACHMENT_BUCKET = 'time-adjust-attachments';
export const TIME_ADJUST_ATTACHMENT_STORAGE_PROVIDER = 'LOCAL';
export const TIME_ADJUST_ATTACHMENT_MAX_FILE_SIZE = 10 * 1024 * 1024;

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

export function ensureTimeAdjustAttachmentStorageDir(
  timeAdjustRequestId?: string,
) {
  if (!timeAdjustRequestId) {
    throw new BadRequestException('ไม่พบรหัสคำขอแก้เวลา');
  }

  const dir = join(
    UPLOAD_ROOT,
    TIME_ADJUST_ATTACHMENT_BUCKET,
    assertSafePathId(timeAdjustRequestId, 'รหัสคำขอแก้เวลา'),
  );

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  return dir;
}

export function createTimeAdjustAttachmentFileName(originalName: string) {
  const ext = extname(originalName).toLowerCase();
  const safeName = sanitizeFileName(originalName.replace(ext, ''));

  return `${Date.now()}-${randomUUID()}-${safeName}${ext}`;
}

export function createTimeAdjustAttachmentStorageKey(params: {
  timeAdjustRequestId: string;
  filename: string;
}) {
  return `${TIME_ADJUST_ATTACHMENT_BUCKET}/${params.timeAdjustRequestId}/${params.filename}`;
}

export function getTimeAdjustAttachmentAbsolutePath(storageKey: string) {
  const absolutePath = normalize(join(UPLOAD_ROOT, storageKey));
  const normalizedRoot = normalize(UPLOAD_ROOT);

  if (!absolutePath.startsWith(normalizedRoot)) {
    throw new BadRequestException('Storage key ไม่ถูกต้อง');
  }

  return absolutePath;
}

export function timeAdjustAttachmentFileFilter(
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

export function validateTimeAdjustAttachmentFile(file?: Express.Multer.File) {
  if (!file) {
    throw new BadRequestException('กรุณาเลือกไฟล์หลักฐาน');
  }

  const ext = extname(file.originalname).toLowerCase();

  if (!allowedMimeTypes.has(file.mimetype) || !allowedExtensions.has(ext)) {
    throw new BadRequestException(
      'รองรับเฉพาะไฟล์ PDF, JPG, JPEG และ PNG เท่านั้น',
    );
  }

  if (file.size > TIME_ADJUST_ATTACHMENT_MAX_FILE_SIZE) {
    throw new BadRequestException('ไฟล์ต้องมีขนาดไม่เกิน 10 MB');
  }
}