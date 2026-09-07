import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { basename, extname, isAbsolute, join } from 'path';
import { assertSafePathId } from '../../common/utils/safe-path-id.util';

export const COMPANY_LOGO_MAX_FILE_SIZE = 2 * 1024 * 1024;
export const COMPANY_LOGO_PUBLIC_PREFIX = '/uploads/company-logos';

const uploadRoot = process.env.UPLOAD_DIR ?? 'uploads';

export const COMPANY_LOGO_UPLOAD_ROOT = isAbsolute(uploadRoot)
  ? uploadRoot
  : join(process.cwd(), uploadRoot);

export const COMPANY_LOGO_UPLOAD_DIR = join(
  COMPANY_LOGO_UPLOAD_ROOT,
  'company-logos',
);

const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function ensureCompanyLogoStorageDir() {
  if (!existsSync(COMPANY_LOGO_UPLOAD_DIR)) {
    mkdirSync(COMPANY_LOGO_UPLOAD_DIR, {
      recursive: true,
    });
  }
}

export function companyLogoFileFilter(
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

export function createCompanyLogoFileName(
  companyId: string,
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

  // companyId ถูกเอาไปเป็นส่วนหนึ่งของชื่อไฟล์ ถ้าไม่ตรวจ ผู้เรียกใส่ `../`
  // มาแล้วเขียนไฟล์ออกนอกโฟลเดอร์โลโก้ได้
  return `${assertSafePathId(companyId, 'รหัสบริษัท')}-${Date.now()}-${randomUUID()}${ext}`;
}

export function createCompanyLogoPublicUrl(filename: string) {
  return `${COMPANY_LOGO_PUBLIC_PREFIX}/${filename}`;
}

export function getCompanyLogoAbsolutePathFromUrl(logoUrl?: string | null) {
  if (!logoUrl) return null;

  if (!logoUrl.startsWith(`${COMPANY_LOGO_PUBLIC_PREFIX}/`)) {
    return null;
  }

  const filename = basename(logoUrl);

  if (!filename) return null;

  return join(COMPANY_LOGO_UPLOAD_DIR, filename);
}
