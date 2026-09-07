import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { basename, extname, isAbsolute, join } from 'path';
import { assertSafePathId } from '../../common/utils/safe-path-id.util';

/**
 * โลโก้ประจำสาขา
 * ---------------
 * แยกโฟลเดอร์กับโลโก้บริษัทเพื่อให้รู้ได้จาก URL ว่ารูปเป็นของระดับไหน
 * (เวลาย้ายเครื่อง/ล้างไฟล์กำพร้าจะไม่ปนกัน) กติกาชนิดไฟล์และขนาดใช้ชุดเดียวกัน
 */

export const BRANCH_LOGO_MAX_FILE_SIZE = 2 * 1024 * 1024;
export const BRANCH_LOGO_PUBLIC_PREFIX = '/uploads/branch-logos';

const uploadRoot = process.env.UPLOAD_DIR ?? 'uploads';

export const BRANCH_LOGO_UPLOAD_ROOT = isAbsolute(uploadRoot)
  ? uploadRoot
  : join(process.cwd(), uploadRoot);

export const BRANCH_LOGO_UPLOAD_DIR = join(
  BRANCH_LOGO_UPLOAD_ROOT,
  'branch-logos',
);

const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function ensureBranchLogoStorageDir() {
  if (!existsSync(BRANCH_LOGO_UPLOAD_DIR)) {
    mkdirSync(BRANCH_LOGO_UPLOAD_DIR, {
      recursive: true,
    });
  }
}

export function branchLogoFileFilter(
  _req: unknown,
  file: Express.Multer.File,
  callback: (error: Error | null, acceptFile: boolean) => void,
) {
  if (!allowedMimeTypes.has(file.mimetype)) {
    callback(
      new BadRequestException(
        'รองรับเฉพาะไฟล์โลโก้ JPG, PNG หรือ WEBP เท่านั้น',
      ),
      false,
    );
    return;
  }

  callback(null, true);
}

export function createBranchLogoFileName(
  branchId: string,
  file: Express.Multer.File,
) {
  const extFromName = extname(file.originalname).toLowerCase();

  const ext =
    file.mimetype === 'image/jpeg'
      ? '.jpg'
      : file.mimetype === 'image/png'
        ? '.png'
        : file.mimetype === 'image/webp'
          ? '.webp'
          : extFromName || '.jpg';

  // branchId ถูกเอาไปเป็นส่วนหนึ่งของชื่อไฟล์ ถ้าไม่ตรวจ ผู้เรียกใส่ `../`
  // มาแล้วเขียนไฟล์ออกนอกโฟลเดอร์โลโก้ได้
  return `${assertSafePathId(branchId, 'รหัสสาขา')}-${Date.now()}-${randomUUID()}${ext}`;
}

export function createBranchLogoPublicUrl(filename: string) {
  return `${BRANCH_LOGO_PUBLIC_PREFIX}/${filename}`;
}

export function getBranchLogoAbsolutePathFromUrl(logoUrl?: string | null) {
  if (!logoUrl) return null;

  if (!logoUrl.startsWith(`${BRANCH_LOGO_PUBLIC_PREFIX}/`)) {
    return null;
  }

  const filename = basename(logoUrl);

  if (!filename) return null;

  return join(BRANCH_LOGO_UPLOAD_DIR, filename);
}
