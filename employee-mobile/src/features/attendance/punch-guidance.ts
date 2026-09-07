import type { GeofenceStatus } from './geofence';
import type { PunchContext } from './punch.types';

/**
 * ตัดสินว่าปุ่มลงเวลากดได้ไหม และต้องบอกอะไรผู้ใช้
 *
 * กติกาสำคัญสองข้อ
 *
 * 1. **backend เป็นคนห้าม ไม่ใช่แอป** — ถ้า `allowed` เป็น false ค่อยปิดปุ่ม
 *    เพราะกดไปก็ถูกปฏิเสธแน่นอน แต่ต้องบอกเหตุผลเสมอ ปุ่มเทาที่ไม่บอกอะไร
 *    ทำให้ผู้ใช้โทรหา HR
 *
 * 2. **พิกัดไม่ใช่เหตุผลปิดปุ่ม** — GPS เพี้ยนได้ ในอาคารคลาดเคลื่อนหลายสิบเมตร
 *    ถ้าแอปปิดปุ่มเองเพราะคิดว่าอยู่นอกพื้นที่ พนักงานที่ยืนอยู่หน้าออฟฟิศจริง ๆ
 *    จะลงเวลาไม่ได้เลยและไม่มีทางแก้ที่ปลายทาง
 *    จึงได้แค่ "เตือน" แล้วปล่อยให้ server ซึ่งคำนวณเองอีกรอบเป็นผู้ตัดสิน
 */

export type PunchBlockLevel = 'BLOCKED' | 'WARN' | 'READY';

export interface PunchGuidance {
  /** กดปุ่มลงเวลาได้หรือไม่ */
  canAttempt: boolean;
  level: PunchBlockLevel;
  /** ข้อความสั้นบนแถบเตือน — null เมื่อไม่มีอะไรต้องบอก */
  message: string | null;
  /** ป้ายบนปุ่ม */
  actionLabel: string;
  /** ต้องยืนยันซ้ำก่อนส่งไหม (ใช้กับกรณีที่น่าจะโดนปฏิเสธ) */
  requiresConfirmation: boolean;
}

export type LocationPermission = 'GRANTED' | 'DENIED' | 'PENDING' | 'DISABLED';

export interface PunchGuidanceInput {
  context: PunchContext | null;
  geofenceStatus: GeofenceStatus;
  /** ต้องเดินเข้าไปอีกกี่เมตรถึงจะถึงขอบรัศมี */
  metersToEdge: number;
  locationPermission: LocationPermission;
}

/** ป้ายปุ่มตามรอบที่กำลังจะลง — ผู้ใช้ต้องรู้ว่ากดแล้วเกิดอะไร */
const ACTION_LABEL: Record<string, string> = {
  AFTERNOON_IN: 'ลงเวลาเข้างาน (บ่าย)',
  CHECK_OUT: 'ลงเวลาออกงาน',
  CUSTOM: 'ลงเวลา',
  MORNING_IN: 'ลงเวลาเข้างาน',
  OFFSITE_IN: 'เริ่มงานนอกสถานที่',
  OFFSITE_OUT: 'จบงานนอกสถานที่',
};

/** เหตุผลจาก backend แปลเป็นภาษาที่บอกทางออกด้วย ไม่ใช่แค่บอกว่าไม่ได้ */
const REASON_MESSAGE: Record<string, string> = {
  DAY_OFF: 'วันนี้เป็นวันหยุด และยังไม่มีรอบลงเวลาที่เปิดอยู่',
  NO_ACTIVE_SHIFT: 'ยังไม่ถึงเวลาของรอบใด ๆ ในวันนี้',
  PUNCH_NOT_ALLOWED_NOW: 'ยังไม่ถึงเวลาที่เปิดให้ลงเวลาของรอบนี้',
};

const blocked = (message: string): PunchGuidance => ({
  actionLabel: 'ลงเวลา',
  canAttempt: false,
  level: 'BLOCKED',
  message,
  requiresConfirmation: false,
});

export function resolvePunchGuidance({
  context,
  geofenceStatus,
  metersToEdge,
  locationPermission,
}: PunchGuidanceInput): PunchGuidance {
  if (!context) {
    return blocked('ยังโหลดข้อมูลรอบลงเวลาไม่สำเร็จ');
  }

  const actionLabel =
    ACTION_LABEL[context.currentSession?.sessionCode ?? ''] ?? 'ลงเวลา';

  if (!context.allowed) {
    /* ข้อความจาก backend มาก่อนเสมอ เพราะรู้เหตุผลเฉพาะเคสมากกว่าแอป */
    const message =
      context.reason ??
      REASON_MESSAGE[context.reasonCode ?? ''] ??
      'ตอนนี้ยังลงเวลาไม่ได้';

    return { ...blocked(message), actionLabel };
  }

  const geofenceRequired = Boolean(context.locationPolicy.required);

  if (geofenceRequired) {
    if (locationPermission === 'DISABLED') {
      return {
        ...blocked(
          'ตำแหน่งที่ตั้งของเครื่องปิดอยู่ ต้องเปิดก่อนจึงจะลงเวลาได้',
        ),
        actionLabel,
      };
    }

    if (locationPermission === 'DENIED') {
      return {
        ...blocked(
          'ตำแหน่งนี้บังคับให้ตรวจพิกัด ต้องอนุญาตให้แอปเข้าถึงตำแหน่งก่อน',
        ),
        actionLabel,
      };
    }

    if (locationPermission === 'PENDING') {
      return {
        actionLabel,
        canAttempt: false,
        level: 'WARN',
        message: 'กำลังอ่านตำแหน่ง รอสักครู่',
        requiresConfirmation: false,
      };
    }

    /*
     * อยู่นอกรัศมีชัดเจน — ยังเปิดปุ่มไว้ แต่ต้องยืนยันซ้ำ
     * ผู้ใช้จะได้ไม่กดพลาดแล้วเสียเที่ยว และยังกดได้ถ้า GPS ในอาคารเพี้ยน
     */
    if (geofenceStatus === 'OUTSIDE') {
      return {
        actionLabel,
        canAttempt: true,
        level: 'WARN',
        message: `อยู่นอกพื้นที่ที่อนุญาต ต้องเข้าไปอีกประมาณ ${metersToEdge.toLocaleString('th-TH')} เมตร`,
        requiresConfirmation: true,
      };
    }

    if (geofenceStatus === 'UNCERTAIN') {
      return {
        actionLabel,
        canAttempt: true,
        level: 'WARN',
        message: 'สัญญาณตำแหน่งยังไม่แม่น ระบบจะตรวจพิกัดอีกครั้งตอนบันทึก',
        requiresConfirmation: false,
      };
    }

    if (geofenceStatus === 'UNKNOWN') {
      return {
        actionLabel,
        canAttempt: true,
        level: 'WARN',
        message: 'ยังอ่านตำแหน่งไม่ได้ ระบบจะตรวจพิกัดอีกครั้งตอนบันทึก',
        requiresConfirmation: true,
      };
    }
  }

  /*
   * วันหยุดแต่มีรอบให้ลง = ถูกเรียกมาทำงานวันหยุด — กดได้ แต่ต้องยืนยันซ้ำ
   * เพราะคนส่วนใหญ่ที่เปิดแอปในวันหยุดคือกดพลาด ไม่ใช่มาทำงานจริง
   *
   * เตือนท้ายสุดหลังผ่านเรื่องพิกัดแล้ว เรื่องพิกัดสำคัญกว่าและต้องได้ที่
   * บนแถบเตือนก่อน
   */
  if (context.holiday?.isHoliday) {
    return {
      actionLabel,
      canAttempt: true,
      level: 'WARN',
      message:
        context.holiday.holidayName
          ? `วันนี้เป็นวันหยุด (${context.holiday.holidayName}) ระบบจะบันทึกเป็นการมาทำงานวันหยุด`
          : 'วันนี้เป็นวันหยุด ระบบจะบันทึกเป็นการมาทำงานวันหยุด',
      requiresConfirmation: true,
    };
  }

  return {
    actionLabel,
    canAttempt: true,
    level: 'READY',
    message: null,
    requiresConfirmation: false,
  };
}
