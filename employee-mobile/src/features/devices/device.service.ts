import { buildInstallationPayload } from '@/features/auth/installation';
import { apiClient } from '@/lib/api/api-client';
import { ApiError } from '@/lib/api/api-error';
import { captureEvent } from '@/lib/monitoring/monitoring';

/**
 * ลงทะเบียนเครื่องหลังเข้าสู่ระบบสำเร็จ (BE-MOB-004)
 *
 * ยังไม่ส่ง Expo push token ในเฟสนี้ — การขอสิทธิ์แจ้งเตือนอยู่ใน Phase 5
 * และบทที่ 15.4 กำหนดว่าต้องขอแบบมีบริบท ไม่ใช่เด้งขอทันทีที่เปิดแอป
 *
 * ล้มเหลวแล้วไม่ throw เพราะการลงทะเบียนเครื่องไม่ควรกันผู้ใช้ออกจากแอป
 */
export async function registerCurrentDevice() {
  try {
    const installation = await buildInstallationPayload();

    await apiClient.post('/mobile/v1/devices/register', { installation });
  } catch (error) {
    captureEvent({
      context: { code: error instanceof ApiError ? error.code : 'UNKNOWN' },
      level: 'warning',
      message: 'device_register_failed',
    });
  }
}
