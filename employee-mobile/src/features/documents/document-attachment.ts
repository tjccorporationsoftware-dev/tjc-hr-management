import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { getAppConfig } from '@/config/app-config';
import { useAuthStore } from '@/features/auth/auth.store';
import {
  compressAttachment,
  pickAttachmentImage,
  type AttachmentSource,
} from '@/features/requests/attachment';
import { ApiError } from '@/lib/api/api-error';
import { runIdempotentMutation } from '@/lib/api/idempotency';
import { uploadMultipartFile } from '@/lib/api/multipart-upload';
import { getOrCreateInstallationId } from '@/lib/storage/secure-storage';

export { type AttachmentSource };

export async function prepareDocumentAttachment(source: AttachmentSource) {
  const uri = await pickAttachmentImage(source);
  if (!uri) return null;
  return compressAttachment(uri);
}

async function mobileHeaders(idempotencyKey?: string) {
  const config = getAppConfig();
  const accessToken = useAuthStore.getState().accessToken;
  if (!accessToken) {
    throw ApiError.invalidRequest('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
  }

  return {
    Authorization: `Bearer ${accessToken}`,
    ...(config.appBuild !== null ? { 'X-App-Build': String(config.appBuild) } : {}),
    ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    'X-App-Version': config.appVersion,
    'X-Installation-Id': await getOrCreateInstallationId(),
    'X-OS-Version': config.osVersion,
    'X-Platform': config.platform,
  };
}

export async function uploadDocumentAttachment(params: {
  requestId: string;
  uri: string;
  name: string;
  title: string;
}) {
  const config = getAppConfig();

  await runIdempotentMutation({
    scope: `document:file:upload:${params.requestId}`,
    payload: {
      name: params.name,
      requestId: params.requestId,
      title: params.title,
      uri: params.uri,
    },
    execute: async (idempotencyKey) => {
      await uploadMultipartFile({
        file: { name: params.name, uri: params.uri },
        headers: await mobileHeaders(idempotencyKey),
        parameters: { title: params.title },
        url: `${config.apiBaseUrl}/mobile/v1/documents/${encodeURIComponent(
          params.requestId,
        )}/files`,
      });
    },
  });
}

export async function shareDocumentFile(params: {
  requestId: string;
  fileId: string;
  fileName: string;
  mimeType?: string | null;
}) {
  if (!(await Sharing.isAvailableAsync())) {
    throw ApiError.invalidRequest('เครื่องนี้ยังเปิดหรือแชร์ไฟล์ไม่ได้');
  }

  const config = getAppConfig();
  const target = new Directory(Paths.cache, 'document-requests');
  if (!target.exists) target.create({ intermediates: true });

  const safeName = params.fileName.replace(/[^\p{L}\p{N}._-]+/gu, '-');
  const file = new File(target, safeName || `document-${params.fileId}`);

  try {
    await File.downloadFileAsync(
      `${config.apiBaseUrl}/mobile/v1/documents/${encodeURIComponent(
        params.requestId,
      )}/files/${encodeURIComponent(params.fileId)}/download`,
      file,
      { headers: await mobileHeaders(), idempotent: true },
    );

    await Sharing.shareAsync(file.uri, {
      mimeType: params.mimeType ?? undefined,
    });
  } finally {
    try {
      if (file.exists) file.delete();
    } catch {
      /* cache ชั่วคราว ระบบจะช่วยล้างต่อ */
    }
  }
}
