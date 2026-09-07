import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { getAppConfig } from '@/config/app-config';
import { useAuthStore } from '@/features/auth/auth.store';
import { apiClient } from '@/lib/api/api-client';
import { ApiError } from '@/lib/api/api-error';
import { runIdempotentMutation } from '@/lib/api/idempotency';
import { uploadMultipartFile } from '@/lib/api/multipart-upload';
import { captureEvent } from '@/lib/monitoring/monitoring';
import { getOrCreateInstallationId } from '@/lib/storage/secure-storage';

import {
  APPROVAL_SLUG,
  REQUEST_SLUG,
  type ApprovalType,
  type RequestType,
} from './requests.types';

/**
 * แนบรูปหลักฐานในใบคำขอ (ใบรับรองแพทย์ ใบเสร็จ ฯลฯ)
 *
 * รูปจากกล้องมือถือสมัยนี้ใบละ 3–8 MB การอัปโหลดตรง ๆ บนเน็ตมือถือ
 * ใช้เวลาเป็นสิบวินาทีและพังกลางทางบ่อย จึงย่อก่อนเสมอ
 * เอกสารที่ถ่ายด้วยมือถือกว้าง 1600px อ่านออกสบายอยู่แล้ว
 */

/** เพดานที่ตกลงไว้ในแผน — ใหญ่กว่านี้อัปโหลดบนเน็ตมือถือไม่ไหว */
const MAX_UPLOAD_BYTES = 1024 * 1024;

const MAX_WIDTH = 1600;

export const MAX_REQUEST_ATTACHMENTS = 5;

/** ไล่บีบลงทีละขั้นจนกว่าจะพอดี ขั้นสุดท้ายยังอ่านออกแต่ไม่สวย */
const QUALITY_STEPS = [0.7, 0.5, 0.35, 0.2];

export interface PreparedAttachment {
  /** มีเฉพาะตอนขอมาด้วย — งานนอกสถานที่ส่งรูปไปกับ payload ไม่ใช่ multipart */
  dataUrl?: string;
  name: string;
  sizeBytes: number;
  uri: string;
}

export type AttachmentSource = 'camera' | 'library';

async function getAttachmentSize(uri: string): Promise<number> {
  /*
   * expo-file-system does not implement File on web. The image manipulator
   * returns a blob: URL there, so asking expo-file-system for its size throws
   * before the attachment can be shown in the form.
   */
  if (Platform.OS === 'web') {
    const response = await fetch(uri);
    if (!response.ok) {
      throw ApiError.invalidRequest('เตรียมรูปไม่สำเร็จ กรุณาลองใหม่');
    }
    return (await response.blob()).size;
  }

  return new File(uri).size ?? 0;
}

/**
 * ขอสิทธิ์แล้วเปิดกล้องหรือคลังรูป
 *
 * คืน null เมื่อผู้ใช้กดยกเลิก ซึ่งไม่ใช่ error — การโยน error ตอนผู้ใช้
 * เปลี่ยนใจจะทำให้ขึ้น toast แดงทั้งที่ไม่มีอะไรผิด
 */
export async function pickAttachmentImages(
  source: AttachmentSource,
  selectionLimit = MAX_REQUEST_ATTACHMENTS,
): Promise<string[]> {
  const permission =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

  if (!permission.granted) {
    throw ApiError.invalidRequest(
      source === 'camera'
        ? 'ต้องอนุญาตให้แอปใช้กล้องก่อนจึงจะถ่ายรูปหลักฐานได้'
        : 'ต้องอนุญาตให้แอปเข้าถึงรูปภาพก่อนจึงจะเลือกรูปได้',
    );
  }

  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync({ quality: 1 })
      : await ImagePicker.launchImageLibraryAsync({
          allowsMultipleSelection: true,
          mediaTypes: ['images'],
          quality: 1,
          selectionLimit,
        });

  if (result.canceled || !result.assets[0]) {
    return [];
  }

  /* Web's picker currently ignores selectionLimit, so enforce it here too. */
  return result.assets
    .slice(0, Math.max(1, selectionLimit))
    .map((asset) => asset.uri);
}

/** Backward-compatible single-image picker used by document requests. */
export async function pickAttachmentImage(
  source: AttachmentSource,
): Promise<string | null> {
  return (await pickAttachmentImages(source, 1))[0] ?? null;
}

/**
 * ย่อและบีบรูปให้ไม่เกินเพดาน
 *
 * ลดขนาดภาพก่อนหนึ่งครั้ง แล้วค่อยไล่ลดคุณภาพ เพราะการลดความกว้าง
 * ช่วยได้มากกว่าการบีบคุณภาพมาก และทำครั้งเดียวก็พอ
 */
export async function compressAttachment(
  uri: string,
  options: { withDataUrl?: boolean } = {},
): Promise<PreparedAttachment> {
  const rendered = await ImageManipulator.manipulate(uri)
    .resize({ width: MAX_WIDTH })
    .renderAsync();

  let last: { base64?: string; size: number; uri: string } | null = null;

  for (const compress of QUALITY_STEPS) {
    const saved = await rendered.saveAsync({
      base64: options.withDataUrl,
      compress,
      format: SaveFormat.JPEG,
    });

    const size = await getAttachmentSize(saved.uri);
    last = { base64: saved.base64, size, uri: saved.uri };

    if (size > 0 && size <= MAX_UPLOAD_BYTES) {
      break;
    }
  }

  if (!last) {
    throw ApiError.invalidRequest('เตรียมรูปไม่สำเร็จ กรุณาลองใหม่');
  }

  if (last.size > MAX_UPLOAD_BYTES) {
    /*
     * บีบจนสุดแล้วยังใหญ่เกิน แปลว่าเป็นรูปความละเอียดสูงมากผิดปกติ
     * บอกผู้ใช้ตรง ๆ ดีกว่าปล่อยให้อัปโหลดแล้วค้างจนหมดเวลา
     */
    captureEvent({
      context: { scope: 'requests.attachment', sizeBytes: last.size },
      level: 'warning',
      message: 'บีบรูปแล้วยังเกินเพดาน',
    });

    throw ApiError.invalidRequest(
      'รูปนี้ใหญ่เกินไปแม้จะย่อแล้ว ลองถ่ายใหม่หรือเลือกรูปอื่น',
    );
  }

  return {
    dataUrl: last.base64 ? `data:image/jpeg;base64,${last.base64}` : undefined,
    name: `attachment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`,
    sizeBytes: last.size,
    uri: last.uri,
  };
}

/**
 * อัปโหลดไฟล์แนบ
 *
 * รายละเอียดว่าทำไมไม่ใช้ fetch + FormData บน native อยู่ใน
 * lib/api/multipart-upload.ts
 */
export async function uploadAttachment(params: {
  file: PreparedAttachment;
  requestId: string;
  title: string;
  type: RequestType;
}): Promise<void> {
  const config = getAppConfig();
  const accessToken = useAuthStore.getState().accessToken;

  if (!accessToken) {
    throw ApiError.invalidRequest('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
  }

  const url = `${config.apiBaseUrl}/mobile/v1/requests/${
    REQUEST_SLUG[params.type]
  }/${encodeURIComponent(params.requestId)}/attachments`;

  await runIdempotentMutation({
    scope: `request:attachment:upload:${params.type}:${params.requestId}`,
    payload: {
      fileName: params.file.name,
      fileUri: params.file.uri,
      sizeBytes: params.file.sizeBytes,
      title: params.title,
    },
    execute: async (idempotencyKey) => {
      await uploadMultipartFile({
        file: params.file,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          ...(config.appBuild !== null
            ? { 'X-App-Build': String(config.appBuild) }
            : {}),
          'Idempotency-Key': idempotencyKey,
          'X-App-Version': config.appVersion,
          'X-Installation-Id': await getOrCreateInstallationId(),
          'X-OS-Version': config.osVersion,
          'X-Platform': config.platform,
        },
        parameters: { title: params.title },
        url,
      });
    },
  });
}


/** ลบหลักฐานของคำขอตัวเอง — Backend ตรวจ ownership และสถานะซ้ำทุกครั้ง */
export async function deleteRequestAttachment(params: {
  attachmentId: string;
  requestId: string;
  type: RequestType;
}): Promise<void> {
  if (!supportsAttachment(params.type)) {
    throw ApiError.invalidRequest('คำขอประเภทนี้ไม่มีไฟล์แนบที่ลบผ่านแอปได้');
  }

  await runIdempotentMutation({
    scope: `request:attachment:delete:${params.type}:${params.requestId}:${params.attachmentId}`,
    payload: params,
    execute: (idempotencyKey) =>
      apiClient.delete<unknown>(
        `/mobile/v1/requests/${REQUEST_SLUG[params.type]}/${encodeURIComponent(
          params.requestId,
        )}/attachments/${encodeURIComponent(params.attachmentId)}`,
        { idempotencyKey },
      ),
  });
}

/** ประเภทที่รองรับไฟล์แนบ — งานนอกสถานที่ยังใช้กลไกคนละแบบใน backend */
export function supportsAttachment(type: RequestType): boolean {
  return type !== 'OFFSITE';
}

/**
 * ประเภทที่ต้องมีรูปหลักฐานก่อนส่งอนุมัติ
 *
 * ตรงกับที่ backend บังคับตอน submit — ตรวจในแอปด้วยเพื่อให้ผู้ใช้รู้ตั้งแต่
 * ยังอยู่ในฟอร์ม ไม่ใช่ไปเจอ error หลังกดส่ง
 */
export function requiresEvidence(type: RequestType): boolean {
  return type !== 'LEAVE';
}

/**
 * ประเภทที่ส่งรูปไปกับ payload แทนการอัปโหลดแยก
 *
 * งานนอกสถานที่เก็บหลักฐานเป็น data URL ในช่อง `attachmentUrl` ของตัวใบเอง
 * ไม่มีตารางไฟล์แนบและไม่มี endpoint อัปโหลดเหมือนประเภทอื่น จึงแนบได้ใบละรูปเดียว
 */
export function sendsEvidenceInPayload(type: RequestType): boolean {
  return type === 'OFFSITE';
}

/** จำนวนรูปสูงสุดที่แนบได้ต่อใบ */
export function maxAttachmentsFor(type: RequestType): number {
  return sendsEvidenceInPayload(type) ? 1 : MAX_REQUEST_ATTACHMENTS;
}

type ShareAttachmentParams = {
  attachmentId: string;
  fileName: string;
  mimeType?: string | null;
  requestId: string;
  type: RequestType;
};

type AppConfig = ReturnType<typeof getAppConfig>;

async function attachmentAuthHeaders(accessToken: string, config: AppConfig) {
  return {
    Authorization: `Bearer ${accessToken}`,
    'X-App-Version': config.appVersion,
    'X-Installation-Id': await getOrCreateInstallationId(),
    'X-Platform': config.platform,
  };
}

/** ดึงไฟล์แนบเป็น blob — ใช้เฉพาะบนเว็บที่ไม่มีระบบไฟล์ให้เขียนลง */
async function downloadAttachmentBlob(
  endpoint: string,
  accessToken: string,
  config: AppConfig,
): Promise<Blob> {
  let response: Response;

  try {
    response = await fetch(`${config.apiBaseUrl}${endpoint}`, {
      headers: await attachmentAuthHeaders(accessToken, config),
    });
  } catch (error) {
    throw ApiError.network(error);
  }

  if (!response.ok) {
    throw ApiError.fromResponse(
      response,
      await response.json().catch(() => undefined),
    );
  }

  return response.blob();
}

/**
 * คืนหน่วยความจำของ object URL ที่สร้างไว้บนเว็บ
 *
 * บน native เป็น path ของไฟล์ใน cache ซึ่งระบบล้างเอง จึงไม่ต้องทำอะไร
 */
export function releaseAttachmentPreview(uri: string | null | undefined) {
  if (uri?.startsWith('blob:')) {
    URL.revokeObjectURL(uri);
  }
}

/**
 * ดาวน์โหลดรูปหลักฐานไว้ใน cache เพื่อแสดง Preview ในหน้ารายละเอียด
 *
 * ใช้ endpoint เดียวกับการเปิดไฟล์และส่ง token เหมือนกัน ห้ามประกอบ URL ให้
 * `<Image>` โหลดตรง ๆ เพราะไฟล์นี้เป็นข้อมูลพนักงานและ endpoint ไม่ใช่ public
 *
 * ไฟล์เดียวกันใช้ร่วมกันได้ทั้งฝั่งผู้ยื่นและฝั่งผู้อนุมัติ จึงตั้งชื่อด้วย
 * attachmentId เพียงอย่างเดียว ไม่ผูกกับว่ามาจาก endpoint ไหน
 */
async function cacheAttachmentPreview(params: {
  attachmentId: string;
  endpoint: string;
  fileName: string;
}): Promise<string> {
  const config = getAppConfig();
  const accessToken = useAuthStore.getState().accessToken;

  if (!accessToken) {
    throw ApiError.invalidRequest('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
  }

  /*
   * เว็บไม่มีระบบไฟล์ให้ expo-file-system เขียนลง — downloadFileAsync แค่
   * console.warn แล้ว resolve เฉย ๆ ได้ไฟล์ว่างเสมอ จึงต้องดึงเป็น blob
   * แล้วทำ object URL เอง เหมือนที่หน้าอนุมัติฝั่งเว็บทำอยู่
   */
  if (Platform.OS === 'web') {
    return URL.createObjectURL(
      await downloadAttachmentBlob(params.endpoint, accessToken, config),
    );
  }

  const safeName = params.fileName.replace(/[^\p{L}\p{N}._-]+/gu, '-');
  const target = new Directory(Paths.cache, 'request-attachment-previews');

  if (!target.exists) target.create({ intermediates: true });

  const file = new File(
    target,
    `${params.attachmentId}-${safeName || 'preview.jpg'}`,
  );

  /*
   * ดาวน์โหลดที่พังกลางทางทิ้งไฟล์ขนาด 0 ไว้ ถ้าเช็คแค่ exists จะเสิร์ฟไฟล์เสีย
   * ตัวนั้นตลอดไปและรูปจะไม่ขึ้นอีกเลยจนกว่าระบบจะล้าง cache เอง
   */
  if (!file.exists || !file.size) {
    await File.downloadFileAsync(`${config.apiBaseUrl}${params.endpoint}`, file, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-App-Version': config.appVersion,
        'X-Installation-Id': await getOrCreateInstallationId(),
        'X-Platform': config.platform,
      },
      idempotent: true,
    });
  }

  if (!file.exists || !file.size) {
    throw ApiError.invalidRequest('โหลดรูปหลักฐานไม่สำเร็จ');
  }

  return file.uri;
}

/** โหลดรูปตัวอย่างของหลักฐานในใบคำขอตัวเอง */
export function cacheRequestAttachmentPreview(params: ShareAttachmentParams) {
  return cacheAttachmentPreview({
    attachmentId: params.attachmentId,
    endpoint: requestAttachmentDownloadPath(params),
    fileName: params.fileName,
  });
}

/** กล่องอนุมัติเปิดไฟล์ของคำร้องเอกสารได้ด้วย ซึ่งพนักงานยื่นเองไม่ได้ */
type ShareApprovalAttachmentParams = Omit<ShareAttachmentParams, 'type'> & {
  type: ApprovalType;
};

/* เปิดไฟล์กับดูรูปตัวอย่างใช้ endpoint เดียวกัน จึงประกอบ path ไว้ที่เดียว */
function requestAttachmentDownloadPath(params: ShareAttachmentParams) {
  return `/mobile/v1/requests/${REQUEST_SLUG[params.type]}/${encodeURIComponent(
    params.requestId,
  )}/attachments/${encodeURIComponent(params.attachmentId)}/download`;
}

function approvalAttachmentDownloadPath(params: ShareApprovalAttachmentParams) {
  return `/mobile/v1/approvals/${
    APPROVAL_SLUG[params.type]
  }/${encodeURIComponent(params.requestId)}/attachments/${encodeURIComponent(
    params.attachmentId,
  )}/download`;
}

/**
 * เว็บไม่มีแผ่นแชร์ของระบบ — บันทึกไฟล์ลงเครื่องแทน
 *
 * ใช้ anchor ที่มี download แทน window.open เพราะโค้ดนี้ทำงานหลัง await
 * เบราว์เซอร์จึงไม่นับเป็นการกดของผู้ใช้แล้ว และจะโดนตัวกันป๊อปอัปบล็อก
 */
async function saveAttachmentOnWeb(
  params: ShareAttachmentParams,
  endpoint: string,
  accessToken: string,
  config: AppConfig,
): Promise<void> {
  const blob = await downloadAttachmentBlob(endpoint, accessToken, config);
  const objectUrl = URL.createObjectURL(blob);

  try {
    const link = document.createElement('a');
    link.download = params.fileName || `attachment-${params.attachmentId}`;
    link.href = objectUrl;
    link.click();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function shareAttachmentFromEndpoint(
  params: ShareAttachmentParams,
  endpoint: string,
): Promise<void> {
  const config = getAppConfig();
  const accessToken = useAuthStore.getState().accessToken;

  if (!accessToken) {
    throw ApiError.invalidRequest('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
  }

  if (Platform.OS === 'web') {
    return saveAttachmentOnWeb(params, endpoint, accessToken, config);
  }

  if (!(await Sharing.isAvailableAsync())) {
    throw ApiError.invalidRequest('เครื่องนี้ยังเปิดหรือแชร์ไฟล์ไม่ได้');
  }

  const safeName = params.fileName.replace(/[^\p{L}\p{N}._-]+/gu, '-');
  const target = new Directory(Paths.cache, 'request-attachments');

  if (!target.exists) target.create({ intermediates: true });

  const file = new File(target, safeName || `attachment-${params.attachmentId}`);

  try {
    await File.downloadFileAsync(
      `${config.apiBaseUrl}${endpoint}`,
      file,
      {
        headers: await attachmentAuthHeaders(accessToken, config),
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
      /* cache จะถูกระบบล้างภายหลัง */
    }
  }
}

/** ดาวน์โหลดหลักฐานของคำขอตัวเองลง cache ชั่วคราวแล้วเปิดแผ่นแชร์ */
export function shareRequestAttachment(params: ShareAttachmentParams) {
  return shareAttachmentFromEndpoint(
    params,
    requestAttachmentDownloadPath(params),
  );
}

/** ดาวน์โหลดหลักฐานหลังตรวจ scope ผู้อนุมัติที่ Backend แล้ว */
export function shareApprovalAttachment(
  params: ShareApprovalAttachmentParams,
) {
  return shareAttachmentFromEndpoint(
    params as ShareAttachmentParams,
    approvalAttachmentDownloadPath(params),
  );
}

/**
 * โหลดรูปตัวอย่างของหลักฐานในกล่องอนุมัติ
 *
 * คนอนุมัติต้องเห็นรูปตั้งแต่ในรายละเอียด ไม่ใช่ต้องกดเปิดออกไปแอปอื่นก่อน
 * ถึงจะรู้ว่าใบรับรองแพทย์ที่แนบมาใช่ของจริงหรือไม่
 */
export function cacheApprovalAttachmentPreview(
  params: ShareApprovalAttachmentParams,
) {
  return cacheAttachmentPreview({
    attachmentId: params.attachmentId,
    endpoint: approvalAttachmentDownloadPath(params),
    fileName: params.fileName,
  });
}
