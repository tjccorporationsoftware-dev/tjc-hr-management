import { z } from 'zod';

/**
 * วันในปฏิทินเป็น "วันตามปฏิทิน" ไม่ใช่จุดเวลา
 *
 * backend ส่ง workDate มาเป็น DATE ล้วน (`2026-08-03T00:00:00.000Z`)
 * ถ้าแปลงเป็น Date object แล้วอ่านวันจากเครื่อง ผู้ใช้ที่ตั้งโซนเวลาเป็น
 * UTC-x จะเห็นวันเลื่อนไปหนึ่งวันทั้งเดือน จึงเก็บเป็นสตริง YYYY-MM-DD ตรง ๆ
 */
const dateKeySchema = z.union([z.string(), z.date()]).transform((value) => {
  const iso = value instanceof Date ? value.toISOString() : value;

  return iso.slice(0, 10);
});

export const attendanceDayStateSchema = z
  .enum(['ABSENT', 'MISSING_LOG', 'LEAVE', 'LATE', 'HOLIDAY', 'PRESENT'])
  /* สถานะใหม่จาก backend ต้องไม่ทำให้ทั้งเดือนโหลดไม่ขึ้น */
  .catch('PRESENT');

export type AttendanceDayState = z.infer<typeof attendanceDayStateSchema>;

export const attendanceDaySchema = z.object({
  afternoonInAt: z.coerce.date().nullish(),
  /*
   * ความสายแยกรอบเช้า/บ่าย — backend รุ่นก่อนไม่ส่งมา จึง default เป็น 0 แล้ว
   * ให้จอถอยไปแสดงยอดรวมแทน ไม่ใช่ขึ้นเป็นศูนย์ทั้งที่วันนั้นสายจริง
   */
  afternoonLateMinutes: z.coerce.number().default(0),
  checkOutAt: z.coerce.date().nullish(),
  deductionAmount: z.coerce.number().default(0),
  earlyCheckoutMinutes: z.coerce.number().default(0),
  lateMinutes: z.coerce.number().default(0),
  /** ชื่อวันหยุด — null เมื่อเป็นวันหยุดประจำสัปดาห์ซึ่งไม่มีชื่อ */
  holidayName: z.string().nullish(),
  leaveIsPaid: z.boolean().nullish(),
  leaveTypeName: z.string().nullish(),
  morningInAt: z.coerce.date().nullish(),
  morningLateMinutes: z.coerce.number().default(0),
  /** นาทีที่วันนั้นถูกอนุมัติให้ทำงานนอกสถานที่ — 0 = ไม่ได้ออกนอกบริษัท */
  offsiteMinutes: z.coerce.number().default(0),
  otMinutes: z.coerce.number().default(0),
  state: attendanceDayStateSchema,
  workDate: dateKeySchema,
});

export type AttendanceDay = z.infer<typeof attendanceDaySchema>;

/**
 * ช่วงวันที่ backend นับให้จริง
 *
 * แอปรุ่นเก่าคุยกับ backend ใหม่ได้ และรุ่นใหม่คุยกับ backend เก่าได้ จึงเป็น
 * nullish ไว้ — ถ้าไม่มีมาก็แค่ไม่แสดงหัวข้อช่วงวัน ไม่ใช่ทั้งจอโหลดไม่ขึ้น
 */
export const attendancePeriodSchema = z.object({
  from: z.string(),
  to: z.string(),
  type: z.enum(['calendar', 'payroll']).catch('calendar'),
});

export type AttendancePeriod = z.infer<typeof attendancePeriodSchema>;

export const attendanceHistorySchema = z.object({
  days: z.array(attendanceDaySchema).default([]),
  month: z.string(),
  period: attendancePeriodSchema.nullish(),
  summary: z.object({
    absentDays: z.coerce.number().default(0),
    lateDays: z.coerce.number().default(0),
    leaveDays: z.coerce.number().default(0),
    missingLogDays: z.coerce.number().default(0),
    otMinutes: z.coerce.number().default(0),
    presentDays: z.coerce.number().default(0),
    totalDeductionAmount: z.coerce.number().default(0),
    totalLateMinutes: z.coerce.number().default(0),
  }),
});

export type AttendanceHistory = z.infer<typeof attendanceHistorySchema>;
