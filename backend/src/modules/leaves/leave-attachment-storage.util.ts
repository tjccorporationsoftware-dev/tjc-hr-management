import { BadRequestException } from '@nestjs/common';
import { assertSafePathId } from '../../common/utils/safe-path-id.util';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { extname, join, normalize } from 'path';

export const LEAVE_ATTACHMENT_BUCKET = 'leave-attachments';
export const LEAVE_ATTACHMENT_STORAGE_PROVIDER = 'LOCAL';
export const LEAVE_ATTACHMENT_MAX_FILE_SIZE = 10 * 1024 * 1024;

const UPLOAD_ROOT = join(process.cwd(), 'public', 'uploads');

const allowedMimeTypes = new Set(['image/jpeg', 'image/png']);
const allowedExtensions = new Set(['.jpg', '.jpeg', '.png']);

function sanitizeFileName(fileName: string) {
  return fileName
    .replace(/[^\w.\-฀-๿]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 160);
}

export function ensureLeaveAttachmentStorageDir(leaveRequestId?: string) {
  if (!leaveRequestId) {
    throw new BadRequestException('ไม่พบรหัสใบลา');
  }

  const dir = join(
    UPLOAD_ROOT,
    LEAVE_ATTACHMENT_BUCKET,
    assertSafePathId(leaveRequestId, 'รหัสใบลา'),
  );

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  return dir;
}

export function createLeaveAttachmentFileName(originalName: string) {
  const ext = extname(originalName).toLowerCase();
  const safeName = sanitizeFileName(originalName.replace(ext, ''));

  return `${Date.now()}-${randomUUID()}-${safeName}${ext}`;
}

export function createLeaveAttachmentStorageKey(params: {
  leaveRequestId: string;
  filename: string;
}) {
  return `${LEAVE_ATTACHMENT_BUCKET}/${params.leaveRequestId}/${params.filename}`;
}

export function getLeaveAttachmentAbsolutePath(storageKey: string) {
  const absolutePath = normalize(join(UPLOAD_ROOT, storageKey));
  const normalizedRoot = normalize(UPLOAD_ROOT);

  if (!absolutePath.startsWith(normalizedRoot)) {
    throw new BadRequestException('Storage key ไม่ถูกต้อง');
  }

  return absolutePath;
}

export function leaveAttachmentFileFilter(
  _req: unknown,
  file: Express.Multer.File,
  callback: (error: Error | null, acceptFile: boolean) => void,
) {
  const ext = extname(file.originalname).toLowerCase();

  if (!allowedMimeTypes.has(file.mimetype) || !allowedExtensions.has(ext)) {
    callback(
      new BadRequestException('รองรับเฉพาะรูปภาพ JPG, JPEG และ PNG เท่านั้น'),
      false,
    );
    return;
  }

  callback(null, true);
}

export function validateLeaveAttachmentFile(file?: Express.Multer.File) {
  if (!file) {
    throw new BadRequestException('กรุณาเลือกรูปหลักฐาน');
  }

  const ext = extname(file.originalname).toLowerCase();

  if (!allowedMimeTypes.has(file.mimetype) || !allowedExtensions.has(ext)) {
    throw new BadRequestException('รองรับเฉพาะรูปภาพ JPG, JPEG และ PNG เท่านั้น');
  }

  if (file.size > LEAVE_ATTACHMENT_MAX_FILE_SIZE) {
    throw new BadRequestException('รูปหลักฐานต้องมีขนาดไม่เกิน 10 MB');
  }
}
