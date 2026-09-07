import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { getAppConfig } from '@/config/app-config';
import { useAuthStore } from '@/features/auth/auth.store';
import { ApiError } from '@/lib/api/api-error';
import { uploadMultipartFile } from '@/lib/api/multipart-upload';
import { getOrCreateInstallationId } from '@/lib/storage/secure-storage';

import { mobileProfileSchema, type MobileProfile } from './profile.types';

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const AVATAR_WIDTH = 1200;
const QUALITY_STEPS = [0.85, 0.7, 0.55, 0.4];

async function getAvatarSize(uri: string): Promise<number> {
  /* expo-file-system ไม่มี File implementation บนเว็บ รูปที่ผ่าน manipulator
   * จะเป็น blob URL จึงต้องอ่านขนาดผ่าน Web Blob โดยตรง */
  if (Platform.OS === 'web') {
    const response = await fetch(uri);
    if (!response.ok) {
      throw ApiError.invalidRequest('อ่านรูปที่เลือกไม่สำเร็จ กรุณาเลือกใหม่');
    }
    return (await response.blob()).size;
  }

  return new File(uri).size ?? 0;
}

export async function pickProfileAvatar(): Promise<string | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

  if (!permission.granted) {
    throw ApiError.invalidRequest(
      'ต้องอนุญาตให้แอปเข้าถึงรูปภาพก่อนจึงจะเปลี่ยนรูปโปรไฟล์ได้',
    );
  }

  /*
   * เปิดเครื่องมือตัดกรอบของระบบ — รูปโปรไฟล์แสดงเป็นวงกลม ถ้าไม่ให้ตัดก่อน
   * รูปแนวนอนจะโดนครอปกลางภาพให้เอง หน้าคนเลยหลุดออกนอกวงบ่อย ๆ
   *
   *  มีผลกับ Android (iOS บังคับสี่เหลี่ยมจัตุรัสอยู่แล้วเมื่อเปิด
   * allowsEditing) ผู้ใช้เลื่อน/ซูม/หมุนในกรอบได้จากเครื่องมือของระบบเอง
   * ไม่ต้องพาไปอีกจอหนึ่งในแอป
   */
  const result = await ImagePicker.launchImageLibraryAsync({
    allowsEditing: true,
    aspect: [1, 1],
    mediaTypes: ['images'],
    quality: 1,
  });

  if (result.canceled || !result.assets[0]) return null;
  return result.assets[0].uri;
}

export async function prepareProfileAvatar(uri: string) {
  const rendered = await ImageManipulator.manipulate(uri)
    .resize({ width: AVATAR_WIDTH })
    .renderAsync();

  let last: { uri: string; size: number } | null = null;

  for (const compress of QUALITY_STEPS) {
    const saved = await rendered.saveAsync({
      compress,
      format: SaveFormat.JPEG,
    });
    const size = await getAvatarSize(saved.uri);
    last = { uri: saved.uri, size };

    if (size > 0 && size <= MAX_AVATAR_BYTES) break;
  }

  if (!last || last.size <= 0 || last.size > MAX_AVATAR_BYTES) {
    throw ApiError.invalidRequest('รูปโปรไฟล์ใหญ่เกินไป กรุณาเลือกรูปอื่น');
  }

  return last.uri;
}

export async function uploadProfileAvatar(uri: string): Promise<MobileProfile> {
  const config = getAppConfig();
  const accessToken = useAuthStore.getState().accessToken;

  if (!accessToken) {
    throw ApiError.invalidRequest('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
  }

  const payload = await uploadMultipartFile({
    fieldName: 'avatar',
    file: { name: 'profile-avatar.jpg', uri },
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(config.appBuild !== null
        ? { 'X-App-Build': String(config.appBuild) }
        : {}),
      'X-App-Version': config.appVersion,
      'X-Installation-Id': await getOrCreateInstallationId(),
      'X-OS-Version': config.osVersion,
      'X-Platform': config.platform,
    },
    url: `${config.apiBaseUrl}/mobile/v1/profile/avatar`,
  });

  const envelope = payload as { data?: unknown };
  const parsed = mobileProfileSchema.safeParse(envelope?.data ?? payload);
  if (!parsed.success) throw ApiError.invalidResponse(parsed.error.issues);

  return parsed.data;
}

export async function shareProfileDocument(params: {
  id: string;
  fileName: string;
  mimeType?: string | null;
}) {
  if (!(await Sharing.isAvailableAsync())) {
    throw ApiError.invalidRequest('เครื่องนี้ยังเปิดหรือแชร์ไฟล์ไม่ได้');
  }

  const config = getAppConfig();
  const accessToken = useAuthStore.getState().accessToken;
  if (!accessToken) {
    throw ApiError.invalidRequest('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
  }

  const target = new Directory(Paths.cache, 'profile-documents');
  if (!target.exists) target.create({ intermediates: true });

  const safeName = params.fileName.replace(/[^\p{L}\p{N}._-]+/gu, '-');
  const file = new File(target, safeName || `document-${params.id}`);

  try {
    await File.downloadFileAsync(
      `${config.apiBaseUrl}/mobile/v1/profile/documents/${encodeURIComponent(
        params.id,
      )}/download`,
      file,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          ...(config.appBuild !== null
            ? { 'X-App-Build': String(config.appBuild) }
            : {}),
          'X-App-Version': config.appVersion,
          'X-Installation-Id': await getOrCreateInstallationId(),
          'X-OS-Version': config.osVersion,
          'X-Platform': config.platform,
        },
        idempotent: true,
      },
    );

    await Sharing.shareAsync(file.uri, {
      mimeType: params.mimeType ?? undefined,
    });
  } finally {
    try {
      if (file.exists) file.delete();
    } catch {
      /* เป็น cache ชั่วคราว ระบบจะล้างต่อให้ */
    }
  }
}
