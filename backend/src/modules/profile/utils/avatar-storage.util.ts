import { BadRequestException } from "@nestjs/common";
import { randomUUID } from "crypto";
import { existsSync, mkdirSync } from "fs";
import { basename, extname, isAbsolute, join } from "path";

export const AVATAR_MAX_FILE_SIZE = 2 * 1024 * 1024;
export const AVATAR_PUBLIC_PREFIX = "/uploads/avatars";

const uploadRoot = process.env.UPLOAD_DIR ?? "uploads";

export const AVATAR_UPLOAD_ROOT = isAbsolute(uploadRoot)
  ? uploadRoot
  : join(process.cwd(), uploadRoot);

export const AVATAR_UPLOAD_DIR = join(AVATAR_UPLOAD_ROOT, "avatars");

const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export function ensureAvatarStorageDir() {
  if (!existsSync(AVATAR_UPLOAD_DIR)) {
    mkdirSync(AVATAR_UPLOAD_DIR, {
      recursive: true,
    });
  }
}

export function avatarFileFilter(
  _req: unknown,
  file: Express.Multer.File,
  callback: (error: Error | null, acceptFile: boolean) => void,
) {
  if (!allowedMimeTypes.has(file.mimetype)) {
    callback(
      new BadRequestException(
        "รองรับเฉพาะไฟล์รูปภาพ JPG, PNG หรือ WEBP เท่านั้น",
      ),
      false,
    );
    return;
  }

  callback(null, true);
}

export function createAvatarFileName(userId: string, file: Express.Multer.File) {
  const extFromName = extname(file.originalname).toLowerCase();

  const ext =
    file.mimetype === "image/jpeg"
      ? ".jpg"
      : file.mimetype === "image/png"
        ? ".png"
        : file.mimetype === "image/webp"
          ? ".webp"
          : extFromName || ".jpg";

  return `${userId}-${Date.now()}-${randomUUID()}${ext}`;
}

export function createAvatarPublicUrl(filename: string) {
  return `${AVATAR_PUBLIC_PREFIX}/${filename}`;
}

export function getAvatarAbsolutePathFromUrl(avatarUrl?: string | null) {
  if (!avatarUrl) return null;

  if (!avatarUrl.startsWith(`${AVATAR_PUBLIC_PREFIX}/`)) {
    return null;
  }

  const filename = basename(avatarUrl);

  if (!filename) return null;

  return join(AVATAR_UPLOAD_DIR, filename);
}