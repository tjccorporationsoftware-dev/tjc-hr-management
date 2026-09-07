import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { getAppConfig } from '@/config/app-config';
import { useAuthStore } from '@/features/auth/auth.store';
import { ApiError } from '@/lib/api/api-error';
import { getOrCreateInstallationId } from '@/lib/storage/secure-storage';

/**
 * เปิดไฟล์รายงานที่สร้างเสร็จแล้ว
 *
 * ดาวน์โหลดลง cache แล้วส่งต่อให้แผ่นแชร์ของระบบ ไม่แสดงในแอปเอง เพราะไฟล์
 * มีทั้ง Excel, CSV และ PDF — ให้ผู้ใช้เลือกแอปที่เขาอ่านจริงดีกว่าฝืนเปิดเอง
 *
 * **ลบไฟล์ทิ้งทุกครั้งหลังแชร์เสร็จ** รายงานมีข้อมูลพนักงานทั้งองค์กร
 * การทิ้งไว้ใน cache แปลว่าใครที่เข้าถึงเครื่องได้ก็อ่านได้โดยไม่ต้องผ่านแอป
 * (ตัวลบอยู่ใน finally จึงทำงานแม้ผู้ใช้กดยกเลิกแผ่นแชร์)
 */
export async function shareExecutiveReport(
  exportFileId: string,
  fileName: string,
) {
  if (!(await Sharing.isAvailableAsync())) {
    throw ApiError.invalidRequest('เครื่องนี้ยังเปิดหรือแชร์ไฟล์ไม่ได้');
  }

  const config = getAppConfig();
  const accessToken = useAuthStore.getState().accessToken;

  if (!accessToken) {
    throw ApiError.invalidRequest('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
  }

  const target = new Directory(Paths.cache, 'executive-reports');
  if (!target.exists) target.create({ intermediates: true });

  const safeName = fileName.replace(/[^\p{L}\p{N}._-]+/gu, '-');
  const file = new File(target, safeName || `report-${exportFileId}`);

  try {
    await File.downloadFileAsync(
      `${config.apiBaseUrl}/mobile/v1/executive/reports/exports/${encodeURIComponent(
        exportFileId,
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

    await Sharing.shareAsync(file.uri);
  } finally {
    try {
      if (file.exists) file.delete();
    } catch {
      /* เป็น cache ชั่วคราว ระบบจะล้างต่อให้ */
    }
  }
}
