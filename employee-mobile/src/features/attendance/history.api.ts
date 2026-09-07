import { apiClient } from '@/lib/api/api-client';
import { ApiError } from '@/lib/api/api-error';

import {
  attendanceHistorySchema,
  type AttendanceHistory,
} from './history.types';

/**
 * ประวัติเวลาของเดือน/งวดหนึ่ง
 *
 * `range` เลือกว่านับตามเดือนปฏิทินหรือรอบเงินเดือนของบริษัท — จอที่เอาตัวเลข
 * ไปเทียบกับสลิป (สรุปเดือนนี้บนหน้าแรก) ต้องใช้ payroll ส่วนจอปฏิทินรายเดือน
 * ต้องใช้ calendar เพราะตารางมันคือเดือนปฏิทินตรง ๆ
 */
export type AttendanceRange = 'calendar' | 'payroll';

export async function fetchAttendanceHistory(
  month: string,
  range: AttendanceRange = 'calendar',
  /**
   * วันอ้างอิงสำหรับ range=payroll — ส่งไปเพื่อให้ backend คืน "งวดที่ครอบวันนี้"
   * ไม่ใช่งวดของเลขเดือน เพราะสองอันนี้ไม่ใช่อันเดียวกันหลังวันตัดของทุกเดือน
   */
  anchorDate?: string,
): Promise<AttendanceHistory> {
  const anchor = anchorDate
    ? `&anchorDate=${encodeURIComponent(anchorDate)}`
    : '';

  const payload = await apiClient.get<unknown>(
    `/mobile/v1/attendance/history?month=${encodeURIComponent(month)}&range=${range}${anchor}`,
  );
  const result = attendanceHistorySchema.safeParse(payload);

  if (!result.success) {
    throw ApiError.invalidResponse(result.error.issues);
  }

  return result.data;
}
