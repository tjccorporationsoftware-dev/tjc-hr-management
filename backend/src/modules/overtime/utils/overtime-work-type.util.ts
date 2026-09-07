import type { AttendanceHolidayInfo } from '../../settings/system-settings.service';
import type { OvertimeWorkTypeValue } from '../types/overtime.types';

/*
 * ประเภทวันของใบ OT มาจากปฏิทินวันหยุด ไม่ใช่จากที่พนักงานเลือกเอง
 * ---------------------------------------------------------------
 * เดิมฟอร์มให้พนักงานเลือก "ประเภทวัน" เองแล้วอัตราค่า OT วิ่งตามที่เลือก
 * ทำให้เลือกผิด (หรือเลือกให้ตัวเองได้เปรียบ) แล้วเงินผิดไปทั้งใบ
 * ตอนนี้ระบบอ่านจากปฏิทินของหน้า /settings/work-policies แทน
 *
 * การจับคู่ยึดตามคำอธิบายของนโยบาย OT:
 * - HOLIDAY         = วันหยุดประจำสัปดาห์ หรือวันหยุดบริษัท
 * - SPECIAL_HOLIDAY = วันหยุดนักขัตฤกษ์ หรือวันหยุดพิเศษตามประกาศบริษัท
 * - WORKDAY         = วันทำงานปกติ รวมถึงวันหยุดที่ถูกสั่งให้มาทำงาน
 *   (มีสิทธิ์หยุดชดเชยแทน จึงคิดเรตวันทำงานเหมือนฝั่งลงเวลา)
 */

export type ResolvedOvertimeDayType = {
  workType: OvertimeWorkTypeValue;
  /** ป้ายภาษาไทยของประเภทวัน ใช้โชว์บนฟอร์มและในข้อความ error */
  label: string;
  /** ชื่อวันหยุดจากปฏิทิน ถ้าวันนั้นเป็นวันหยุด */
  holidayName: string | null;
  /** ที่มาของการตัดสิน ใช้อธิบายให้ผู้ใช้เห็นว่าทำไมได้ประเภทนี้ */
  reason: string;
};

export const OVERTIME_WORK_TYPE_LABEL: Record<OvertimeWorkTypeValue, string> = {
  WORKDAY: 'วันทำงาน',
  HOLIDAY: 'วันหยุด',
  SPECIAL_HOLIDAY: 'วันหยุดพิเศษ',
};

export function resolveOvertimeWorkTypeFromHolidayInfo(
  info: AttendanceHolidayInfo,
): ResolvedOvertimeDayType {
  // วันหยุดที่ถูกสั่งให้มาทำงาน หรือวันหยุดที่สลับไปเป็นวันทำงานแล้ว
  if (!info.isHoliday) {
    if (info.isWorkingHoliday) {
      return {
        workType: 'WORKDAY',
        label: OVERTIME_WORK_TYPE_LABEL.WORKDAY,
        holidayName: info.baseHoliday?.name ?? info.name ?? null,
        reason: 'วันหยุดที่ประกาศให้มาทำงาน (ได้สิทธิ์หยุดชดเชยแทน)',
      };
    }

    if (info.source === 'HOLIDAY_SWAP') {
      return {
        workType: 'WORKDAY',
        label: OVERTIME_WORK_TYPE_LABEL.WORKDAY,
        holidayName: null,
        reason: info.name || 'วันหยุดที่สลับไปเป็นวันทำงาน',
      };
    }

    return {
      workType: 'WORKDAY',
      label: OVERTIME_WORK_TYPE_LABEL.WORKDAY,
      holidayName: null,
      reason: 'วันทำงานปกติตามปฏิทิน',
    };
  }

  if (info.source === 'CUSTOM' && info.holidayType !== 'COMPANY') {
    return {
      workType: 'SPECIAL_HOLIDAY',
      label: OVERTIME_WORK_TYPE_LABEL.SPECIAL_HOLIDAY,
      holidayName: info.name ?? null,
      reason:
        info.holidayType === 'PUBLIC'
          ? `วันหยุดนักขัตฤกษ์${info.name ? ` · ${info.name}` : ''}`
          : `วันหยุดพิเศษตามปฏิทิน${info.name ? ` · ${info.name}` : ''}`,
    };
  }

  return {
    workType: 'HOLIDAY',
    label: OVERTIME_WORK_TYPE_LABEL.HOLIDAY,
    holidayName: info.name ?? null,
    reason:
      info.source === 'WEEKLY'
        ? 'วันหยุดประจำสัปดาห์ตามปฏิทิน'
        : info.source === 'HOLIDAY_SWAP'
          ? `วันหยุดที่สลับมา${info.name ? ` · ${info.name}` : ''}`
          : `วันหยุดบริษัท${info.name ? ` · ${info.name}` : ''}`,
  };
}
